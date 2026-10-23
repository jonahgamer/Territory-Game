// api/backup.js
//
// Admin-only backup console API.
//
// GET  /api/backup?action=tree        -> live database + backup tree
// POST /api/backup { action: "backup-now" }
// POST /api/backup { action: "restore", backupId, confirm }
//
// Restoring always creates a safety snapshot of the current database before
// it changes anything. A successful restore then creates an after-restore
// snapshot and starts a new logical branch from the restored backup.

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { applyCors, connectToDatabase } from "./_db.js";
import {
  acquireBackupLock,
  createDatabaseBackup,
  getBackupInfo,
  getLiveDatabaseStats,
  isBackupId,
  listBackups,
  makeBranchName,
  readBackup,
  readBackupState,
  releaseBackupLock,
  restoreDatabaseFromBackup,
  writeBackupState,
} from "../lib/github-backup.js";

const LOCK_TTL_MS = 60 * 60 * 1000;

function verifyToken(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
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
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function requireAdmin(req, db) {
  const tokenUser = verifyToken(req);
  if (!tokenUser) return { status: 401, message: "Unauthorized" };

  let account;
  try {
    account = await db.collection("users").findOne(
      { username: tokenUser.username },
      { projection: { username: 1, role: 1, banned: 1 } }
    );
  } catch (err) {
    console.error("[backup] account lookup failed:", err.message);
    return { status: 500, message: "Database unavailable" };
  }
  if (!account || account.banned === true) {
    return { status: 401, message: "Unauthorized" };
  }
  if (account.role !== "admin" && account.role !== "root") {
    return { status: 403, message: "Admin only" };
  }
  return {
    user: {
      username: tokenUser.username,
      role: account.role,
      displayName: tokenUser.displayName || tokenUser.username,
    },
  };
}

async function buildTreePayload(db) {
  const info = getBackupInfo();
  let backups = [];
  let state = { version: 1, head: null, branch: "main", updatedAt: null };
  let backupError = null;

  if (info.ok) {
    try {
      const listed = await listBackups();
      backups = listed.backups;
      state = listed.state;
    } catch (err) {
      console.error("[backup] list failed:", err.message);
      backupError = err.message;
    }
  }

  let current;
  try {
    current = await getLiveDatabaseStats(db);
  } catch (err) {
    console.error("[backup] live stats failed:", err.message);
    current = { collections: {}, totalCollections: 0, totalDocs: 0, error: err.message };
  }

  return {
    success: true,
    configured: info.ok,
    config: info.ok
      ? { owner: info.owner, repo: info.repo, branch: info.branch }
      : { error: info.error },
    restoreConfigured: Boolean(process.env.DSCONFIRM),
    schedule: { utc: "0 18 * * *", hongKong: "02:00" },
    current,
    backups,
    state,
    backupError,
    serverNow: Date.now(),
  };
}

async function handleTree(db, res) {
  return res.status(200).json(await buildTreePayload(db));
}

async function handleBackupNow(db, user, res) {
  const info = getBackupInfo();
  if (!info.ok) {
    return res.status(503).json({ success: false, message: info.error });
  }

  let lockToken = null;
  try {
    lockToken = await acquireBackupLock("backup", user.username, LOCK_TTL_MS);
    const backup = await createDatabaseBackup(db, {
      kind: "manual",
      by: user.username,
      source: "admin",
      updateHead: true,
    });
    const tree = await buildTreePayload(db);
    return res.status(200).json({
      success: true,
      backup: {
        id: backup.id,
        dir: backup.dir,
        createdAt: backup.manifest.createdAt,
        collectionCount: backup.manifest.collectionCount,
        totalDocs: backup.manifest.totalDocs,
      },
      tree,
    });
  } catch (err) {
    console.error("[backup] manual backup failed:", err);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message,
      ...(err.backup ? { backup: err.backup } : {}),
      ...(err.lock ? { lock: err.lock } : {}),
    });
  } finally {
    if (lockToken) await releaseBackupLock(lockToken);
  }
}

async function handleRestore(db, user, body, res) {
  const expected = process.env.DSCONFIRM;
  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "Restore is disabled because DSCONFIRM is not configured on the server.",
    });
  }
  if (!safeEqual(body.confirm, expected)) {
    return res.status(403).json({
      success: false,
      message: "The confirmation code is not correct.",
    });
  }

  const backupId = String(body.backupId || "");
  if (!isBackupId(backupId)) {
    return res.status(400).json({ success: false, message: "Invalid backup id." });
  }
  const info = getBackupInfo();
  if (!info.ok) {
    return res.status(503).json({ success: false, message: info.error });
  }

  let lockToken = null;
  try {
    lockToken = await acquireBackupLock("restore", user.username, LOCK_TTL_MS);

    const state = await readBackupState();
    if (state.head === backupId) {
      return res.status(400).json({
        success: false,
        message: "That backup is already the current head.",
      });
    }

    // Read and validate the whole target before the safety snapshot is made.
    // A malformed backup must never touch the live database.
    const target = await readBackup(backupId);
    const targetUsers = target.collections.find((collection) => collection.name === "users");
    if (!targetUsers) {
      return res.status(400).json({
        success: false,
        message: "This backup has no users collection. Refusing to restore it and wipe every account.",
      });
    }
    const hasAdmin = targetUsers.docs.some((user) => (
      user && user.banned !== true && (user.role === "admin" || user.role === "root")
    ));
    if (!hasAdmin) {
      return res.status(400).json({
        success: false,
        message: "This backup has no usable admin account. Restoring it would lock every admin out.",
      });
    }

    // Mandatory safety snapshot. If this fails, the restore is aborted before
    // the first live collection is changed.
    let safety;
    try {
      safety = await createDatabaseBackup(db, {
        kind: "pre-restore",
        by: user.username,
        source: "restore",
        parent: state.head || null,
        branch: state.branch || "main",
        updateHead: false,
      });
    } catch (err) {
      console.error("[backup] safety snapshot failed:", err);
      return res.status(500).json({
        success: false,
        message: "Restore aborted before changing the database: the current state could not be backed up.",
        detail: err.message,
        ...(err.backup ? { backup: err.backup } : {}),
      });
    }

    // Read the new safety snapshot back before touching the live database.
    try {
      await readBackup(safety.id);
    } catch (err) {
      console.error("[backup] safety snapshot validation failed:", err);
      return res.status(500).json({
        success: false,
        message: "Restore aborted before changing the database: the safety snapshot could not be read back.",
        detail: err.message,
        safetyBackup: {
          id: safety.id,
          dir: safety.dir,
          createdAt: safety.manifest.createdAt,
        },
      });
    }

    let restored;
    try {
      restored = await restoreDatabaseFromBackup(db, target);
    } catch (err) {
      console.error("[backup] restore failed:", err);
      return res.status(500).json({
        success: false,
        message: "Restore failed after the safety snapshot was created. The safety backup can be restored again.",
        detail: err.message,
        safetyBackup: {
          id: safety.id,
          dir: safety.dir,
          createdAt: safety.manifest.createdAt,
        },
        results: err.partialResults || [],
      });
    }

    const newBranch = makeBranchName("restore");
    let after = null;
    let stateError = null;
    let fallbackHead = backupId;
    try {
      after = await createDatabaseBackup(db, {
        kind: "after-restore",
        by: user.username,
        source: "restore",
        parent: backupId,
        branch: newBranch,
        updateHead: true,
        restoredFrom: backupId,
        safetyBackup: safety.id,
      });
    } catch (err) {
      console.error("[backup] after-restore snapshot failed:", err);
      stateError = err.message;
      fallbackHead = err.backup?.id || backupId;
      try {
        await writeBackupState({
          head: fallbackHead,
          branch: newBranch,
          reason: "restore",
          restoredFrom: backupId,
          safetyBackup: safety.id,
          by: user.username,
        }, `restore ${backupId}: new branch ${newBranch}`);
      } catch (stateErr) {
        stateError += `; ${stateErr.message}`;
      }
    }

    console.log(`[backup] restored ${backupId} by ${user.username}; new branch ${newBranch}`);
    const tree = await buildTreePayload(db);
    return res.status(200).json({
      success: true,
      restoredFrom: backupId,
      branch: newBranch,
      head: after?.id || fallbackHead,
      safetyBackup: {
        id: safety.id,
        dir: safety.dir,
        createdAt: safety.manifest.createdAt,
      },
      afterRestoreBackup: after
        ? {
            id: after.id,
            dir: after.dir,
            createdAt: after.manifest.createdAt,
            collectionCount: after.manifest.collectionCount,
            totalDocs: after.manifest.totalDocs,
          }
        : null,
      stateError,
      results: restored.results,
      totalDocs: restored.totalDocs,
      collectionsRestored: restored.collectionsRestored,
      collectionsDropped: restored.collectionsDropped,
      tree,
    });
  } catch (err) {
    console.error("[backup] restore request failed:", err);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message,
      ...(err.lock ? { lock: err.lock } : {}),
    });
  } finally {
    if (lockToken) await releaseBackupLock(lockToken);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, message: "Server misconfigured" });
  }

  // Reject anonymous requests before opening a database connection.
  if (!verifyToken(req)) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  let db;
  try {
    db = await connectToDatabase();
  } catch (err) {
    console.error("[backup] DB connection failed:", err.message);
    return res.status(500).json({ success: false, message: "Database unavailable" });
  }

  const auth = await requireAdmin(req, db);
  if (!auth.user) {
    return res.status(auth.status).json({ success: false, message: auth.message });
  }

  let body = {};
  if (req.method === "POST") {
    try { body = await readBody(req); }
    catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  const action = req.query.action || body.action;
  try {
    if (req.method === "GET" && action === "tree") {
      return await handleTree(db, res);
    }
    if (req.method === "GET" && (action === "backup-now" || action === "restore")) {
      return res.status(405).json({
        success: false,
        message: `${action} must be POST, not GET.`,
      });
    }
    if (req.method === "POST" && action === "backup-now") {
      return await handleBackupNow(db, auth.user, res);
    }
    if (req.method === "POST" && action === "restore") {
      return await handleRestore(db, auth.user, body, res);
    }
    return res.status(400).json({ success: false, message: "Unknown action" });
  } catch (err) {
    console.error("[backup] action failed:", action, err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal error",
    });
  }
}

export const config = { maxDuration: 300 };
