// api/login.js
//
// Username / password login endpoint.
//
// POST /api/login
//   Body: { username, password }
//   Success: { success: true, token, user: { username, displayName, role, pfp } }
//   Errors:  { success: false, message: "..." }
//
// Rate limit: 20 attempts / 5 min per IP
// Password hashing: bcrypt (matches main site pattern)

import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// ═══════════════════════════════════════════════════════════════════
// MongoDB connection (lazy, cached)
// ═══════════════════════════════════════════════════════════════════

let _client = null;
let _db = null;

async function connectToDatabase() {
  if (_db) return _db;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'territory_game';
  if (!uri) throw new Error('MONGODB_URI not defined');

  _client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 20000,
    socketTimeoutMS: 30000,
  });
  await _client.connect();
  _db = _client.db(dbName);
  return _db;
}

// ═══════════════════════════════════════════════════════════════════
// Rate limit (in-memory, per-IP)
// ═══════════════════════════════════════════════════════════════════

const MAX_ATTEMPTS = 20;
const WINDOW_MS = 5 * 60_000;
const ENTRY_TTL_MS = 30 * 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

const _rateLimitMap = new Map();
let _lastCleanup = 0;

function cleanupRateMap(now) {
  if (now - _lastCleanup < CLEANUP_INTERVAL_MS) return;
  _lastCleanup = now;
  for (const [ip, rec] of _rateLimitMap) {
    if (now - rec.firstAttempt > ENTRY_TTL_MS) {
      _rateLimitMap.delete(ip);
    }
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  cleanupRateMap(now);

  const rec = _rateLimitMap.get(ip);
  if (!rec) {
    _rateLimitMap.set(ip, { count: 1, firstAttempt: now });
    return { ok: true };
  }

  if (now - rec.firstAttempt > WINDOW_MS) {
    _rateLimitMap.set(ip, { count: 1, firstAttempt: now });
    return { ok: true };
  }

  if (rec.count >= MAX_ATTEMPTS) {
    const remainMs = WINDOW_MS - (now - rec.firstAttempt);
    return { ok: false, remainSec: Math.ceil(remainMs / 1000) };
  }

  rec.count++;
  return { ok: true };
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.connection?.remoteAddress
    || req.socket?.remoteAddress
    || 'unknown';
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 100_000) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function safeUser(user) {
  return {
    username: String(user.username || ''),
    displayName: String(user.displayName || user.username || ''),
    role: (user.role === 'admin' || user.role === 'root') ? 'admin' : 'student',
    pfp: typeof user.pfp === 'string' ? user.pfp : '',
  };
}

// ═══════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // CORS (adjust if your frontend is on a different origin)
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // ── Rate limit ──
  const ip = getClientIP(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again later.',
    });
  }

  // ── Config check ──
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('[login] JWT_SECRET not set');
    return res.status(500).json({ success: false, message: 'Server misconfigured' });
  }

  // ── Read body ──
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Invalid request body' });
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  if (username.length > 64 || password.length > 256) {
    return res.status(400).json({ success: false, message: 'Invalid credentials' });
  }

  // ── Database check ──
  let db;
  try {
    db = await connectToDatabase();
  } catch (err) {
    console.error('[login] DB connection failed:', err.message);
    return res.status(500).json({ success: false, message: 'Database unavailable' });
  }

  // ── User lookup ──
  let user;
  try {
    user = await db.collection('users').findOne({ username });
  } catch (err) {
    console.error('[login] user lookup failed:', err.message);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }

  // Same response for "no user" and "wrong password" (prevent user enumeration)
  if (!user) {
    // Dummy compare to equalize timing
    try { await bcrypt.compare(password, '$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'); } catch {}
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  if (user.banned === true) {
    return res.status(401).json({ success: false, message: 'Account suspended' });
  }

  if (!user.password || typeof user.password !== 'string') {
    // User exists but has no password (e.g. SSO-only account)
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  // ── Password check ──
  let match = false;
  try {
    match = await bcrypt.compare(password, user.password);
  } catch (err) {
    console.error('[login] bcrypt compare failed:', err.message);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }

  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  // ── Sign JWT ──
  const safe = safeUser(user);
  let token;
  try {
    token = jwt.sign(
      {
        username: safe.username,
        role: safe.role,
        displayName: safe.displayName,
        pfp: safe.pfp,
      },
      jwtSecret,
      { expiresIn: '7d' }
    );
  } catch (err) {
    console.error('[login] jwt sign failed:', err.message);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }

  // ── Update lastLoginAt (best-effort) ──
  try {
    await db.collection('users').updateOne(
      { username: safe.username },
      { $set: { lastLoginAt: new Date(), lastLoginIP: ip } }
    );
  } catch {}

  // ── Success ──
  return res.status(200).json({
    success: true,
    token,
    user: safe,
  });
}

// Vercel: allow up to 10s
export const config = {
  maxDuration: 10,
};