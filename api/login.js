// POST /api/login
// Body: { username, password }
// Success: { success: true, token, user: { username, displayName, role, pfp } }

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { applyCors, connectToDatabase } from "./_db.js";

const MAX_ATTEMPTS = 20;
const WINDOW_MS = 5 * 60 * 1000;
const ENTRY_TTL_MS = 30 * 60 * 1000;
// Valid bcrypt hash used only to spend the same time when the account is missing.
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function safeUser(user) {
  return {
    username: String(user.username || ""),
    displayName: String(user.displayName || user.username || ""),
    role: user.role === "root" || user.role === "admin" ? user.role : "student",
    pfp: typeof user.pfp === "string" ? user.pfp : "",
  };
}

async function tooManyAttempts(db, ip) {
  const attempts = db.collection("login_attempts");
  const now = new Date();
  await attempts.deleteMany({ at: { $lt: new Date(now.getTime() - ENTRY_TTL_MS) } });
  const count = await attempts.countDocuments({
    ip,
    at: { $gte: new Date(now.getTime() - WINDOW_MS) },
  });
  if (count >= MAX_ATTEMPTS) return true;
  await attempts.insertOne({ ip, at: now });
  return false;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("[login] JWT_SECRET not set");
    return res.status(500).json({ success: false, message: "Server misconfigured" });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return res.status(400).json({ success: false, message: "Invalid request body" });
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }
  if (username.length > 64 || password.length > 256) {
    return res.status(401).json({ success: false, message: "Invalid username or password" });
  }

  let db;
  try {
    db = await connectToDatabase();
  } catch (err) {
    console.error("[login] DB connection failed:", err.message);
    return res.status(500).json({ success: false, message: "Database unavailable" });
  }

  try {
    if (await tooManyAttempts(db, getClientIP(req))) {
      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Please try again later.",
      });
    }
  } catch (err) {
    console.error("[login] rate limit failed:", err.message);
    return res.status(500).json({ success: false, message: "Internal error" });
  }

  let user;
  try {
    user = await db.collection("users").findOne({ username });
  } catch (err) {
    console.error("[login] user lookup failed:", err.message);
    return res.status(500).json({ success: false, message: "Internal error" });
  }

  const passwordHash = user && typeof user.password === "string" ? user.password : DUMMY_HASH;
  let match = false;
  try {
    match = await bcrypt.compare(password, passwordHash);
  } catch (err) {
    console.error("[login] bcrypt compare failed:", err.message);
    return res.status(500).json({ success: false, message: "Internal error" });
  }

  if (!user || !match || user.banned === true) {
    return res.status(401).json({ success: false, message: "Invalid username or password" });
  }

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
      { expiresIn: "7d" }
    );
  } catch (err) {
    console.error("[login] jwt sign failed:", err.message);
    return res.status(500).json({ success: false, message: "Internal error" });
  }

  try {
    await db.collection("users").updateOne(
      { username: safe.username },
      { $set: { lastLoginAt: new Date() } }
    );
  } catch {
    // Login still succeeds if the timestamp cannot be stored.
  }

  return res.status(200).json({ success: true, token, user: safe });
}

export const config = { maxDuration: 10 };
