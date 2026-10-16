// api/territory.js
//
// Territory Game backend — single endpoint, action-based.
//
// Routes:
//   GET  /api/territory?action=bootstrap          → { maps, problems, contests, user }
//   POST /api/territory  { action: 'save-maps',     maps }
//   POST /api/territory  { action: 'save-problems', problems }
//   POST /api/territory  { action: 'save-contests', contests }
//
// All write ops are admin-only.
// All reads require a valid JWT.

import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';

// ═══════════════════════════════════════════════════════════════════
// MongoDB (lazy, cached)
// ═══════════════════════════════════════════════════════════════════

let _client = null;
let _db = null;

async function getDb() {
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
// Auth
// ═══════════════════════════════════════════════════════════════════

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'root';
}

// ═══════════════════════════════════════════════════════════════════
// Constants (mirror script.js)
// ═══════════════════════════════════════════════════════════════════

const MIN_MAP_SIZE = 1;
const MAX_MAP_SIZE = 40;
const MIN_PROBLEM_NO = 1;
const MAX_PROBLEM_NO = 999;
const MAX_PROBLEM_TEXT = 5000;
const MAX_NAME_LEN = 60;
const MAX_CONTESTANT_ID_LEN = 80;
const PROBLEM_TYPES = ['math', 'oi', 'science', 'puzzle'];

// ═══════════════════════════════════════════════════════════════════
// Body reader
// ═══════════════════════════════════════════════════════════════════

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2_000_000) {
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

// ═══════════════════════════════════════════════════════════════════
// Validators
// ═══════════════════════════════════════════════════════════════════

function isValidCell(cell) {
  if (!cell || typeof cell !== 'object') return false;
  if (cell.kind === 'empty' || cell.kind === 'obstacle') return true;
  if (cell.kind === 'problem') {
    return Number.isInteger(cell.problemNo)
      && cell.problemNo >= MIN_PROBLEM_NO
      && cell.problemNo <= MAX_PROBLEM_NO
      && PROBLEM_TYPES.includes(cell.type);
  }
  return false;
}

function normalizeMap(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.id !== 'string' || !v.id || v.id.length > 80) return null;
  if (typeof v.name !== 'string') return null;
  const name = v.name.trim();
  if (!name || name.length > MAX_NAME_LEN) return null;
  if (!Number.isInteger(v.cols) || v.cols < MIN_MAP_SIZE || v.cols > MAX_MAP_SIZE) return null;
  if (!Number.isInteger(v.rows) || v.rows < MIN_MAP_SIZE || v.rows > MAX_MAP_SIZE) return null;
  if (!Array.isArray(v.cells) || v.cells.length !== v.cols * v.rows) return null;
  if (!v.cells.every(isValidCell)) return null;
  return { id: v.id, name, cols: v.cols, rows: v.rows, cells: v.cells };
}

function normalizeProblem(v) {
  if (!v || typeof v !== 'object') return null;
  if (!Number.isInteger(v.index) || v.index < MIN_PROBLEM_NO || v.index > MAX_PROBLEM_NO) return null;
  if (!PROBLEM_TYPES.includes(v.type)) return null;
  if (typeof v.prompt !== 'string' || v.prompt.length > MAX_PROBLEM_TEXT) return null;
  if (typeof v.answer !== 'string' || v.answer.length > MAX_PROBLEM_TEXT) return null;
  return { index: v.index, type: v.type, prompt: v.prompt, answer: v.answer };
}

function normalizeContest(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.id !== 'string' || !v.id || v.id.length > 80) return null;
  if (typeof v.name !== 'string') return null;
  const name = v.name.trim();
  if (!name || name.length > MAX_NAME_LEN) return null;
  if (typeof v.mapId !== 'string') return null;
  if (!Array.isArray(v.contestantIds)) return null;
  const ids = [];
  for (const raw of v.contestantIds) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || id.length > MAX_CONTESTANT_ID_LEN) continue;
    if (ids.includes(id)) continue;
    ids.push(id);
  }
  return { id: v.id, name, mapId: v.mapId, contestantIds: ids };
}

// ═══════════════════════════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════════════════════════

async function handleBootstrap(req, res, db, user) {
  const [maps, problems, contests] = await Promise.all([
    db.collection('maps').find({}).toArray(),
    db.collection('problems').find({}).toArray(),
    db.collection('contests').find({}).toArray(),
  ]);

  // Strip _id, keep only public fields
  const cleanMaps     = maps.map(m => ({ id: m.id, name: m.name, cols: m.cols, rows: m.rows, cells: m.cells }));
  const cleanProblems = problems.map(p => ({ index: p.index, type: p.type, prompt: p.prompt, answer: p.answer }));
  const cleanContests = contests.map(c => ({
    id: c.id, name: c.name, mapId: c.mapId,
    contestantIds: Array.isArray(c.contestantIds) ? c.contestantIds : [],
  }));

  return res.status(200).json({
    success: true,
    user: { username: user.username, role: user.role, displayName: user.displayName, pfp: user.pfp || '' },
    maps: cleanMaps,
    problems: cleanProblems,
    contests: cleanContests,
    serverNow: Date.now(),
  });
}

async function handleSaveMaps(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });

  const raw = Array.isArray(body.maps) ? body.maps : [];
  const maps = [];
  const seen = new Set();
  for (const item of raw) {
    const m = normalizeMap(item);
    if (!m) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    maps.push(m);
  }

  const col = db.collection('maps');
  await col.deleteMany({});
  if (maps.length > 0) {
    await col.insertMany(maps.map(m => ({ ...m, updatedAt: new Date() })));
  }

  return res.status(200).json({ success: true, count: maps.length });
}

async function handleSaveProblems(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });

  const raw = Array.isArray(body.problems) ? body.problems : [];
  const problems = [];
  const seen = new Set();
  for (const item of raw) {
    const p = normalizeProblem(item);
    if (!p) continue;
    const key = `${p.type}:${p.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push(p);
  }

  const col = db.collection('problems');
  await col.deleteMany({});
  if (problems.length > 0) {
    await col.insertMany(problems.map(p => ({ ...p, updatedAt: new Date() })));
  }

  return res.status(200).json({ success: true, count: problems.length });
}

async function handleSaveContests(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });

  const raw = Array.isArray(body.contests) ? body.contests : [];
  const contests = [];
  const seen = new Set();
  for (const item of raw) {
    const c = normalizeContest(item);
    if (!c) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    contests.push(c);
  }

  const col = db.collection('contests');
  await col.deleteMany({});
  if (contests.length > 0) {
    await col.insertMany(contests.map(c => ({ ...c, updatedAt: new Date() })));
  }

  return res.status(200).json({ success: true, count: contests.length });
}

// ── 学生自己 join contest（不需要 admin） ──
async function handleJoinContest(req, res, db, user, body) {
  const contestId = String(body.contestId || '').trim();
  if (!contestId) return res.status(400).json({ success: false, message: 'Missing contestId' });

  const col = db.collection('contests');
  const contest = await col.findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });

  const contestantId = String(user.username || '').trim();
  if (!contestantId) return res.status(400).json({ success: false, message: 'No username' });

  if (!Array.isArray(contest.contestantIds)) contest.contestantIds = [];
  if (!contest.contestantIds.includes(contestantId)) {
    contest.contestantIds.push(contestantId);
    await col.updateOne(
      { id: contestId },
      { $set: { contestantIds: contest.contestantIds, updatedAt: new Date() } }
    );
  }

  return res.status(200).json({ success: true, contestantIds: contest.contestantIds });
}

// ═══════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // CORS
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  if (origin) res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Auth
  const user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // DB
  let db;
  try {
    db = await getDb();
  } catch (err) {
    console.error('[territory] DB connect failed:', err.message);
    return res.status(500).json({ success: false, message: 'Database unavailable' });
  }

  // Action
  let body = {};
  if (req.method === 'POST') {
    try { body = await readBody(req); }
    catch (e) { return res.status(400).json({ success: false, message: e.message }); }
  }

  const action = req.query.action || body.action;

  try {
    switch (action) {
      case 'bootstrap':     return await handleBootstrap(req, res, db, user);
      case 'save-maps':     return await handleSaveMaps(req, res, db, user, body);
      case 'save-problems': return await handleSaveProblems(req, res, db, user, body);
      case 'save-contests': return await handleSaveContests(req, res, db, user, body);
      case 'join-contest':  return await handleJoinContest(req, res, db, user, body);
      default:
        return res.status(400).json({ success: false, message: 'Unknown action' });
    }
  } catch (err) {
    console.error('[territory] action error:', action, err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
}

export const config = { maxDuration: 20 };