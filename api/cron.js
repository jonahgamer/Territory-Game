// api/cron.js
//
// Vercel Cron entry point. The schedule in vercel.json runs it at 02:00
// Asia/Hong_Kong (18:00 UTC).
//
// Only the full database backup is enabled for now.
//
// Required environment:
//   CRON_SECRET
//   GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_OWNER / GITHUB_BACKUP_REPO
//   (GITHUB_BACKUP_BRANCH is optional, default main)

import { connectToDatabase } from "./_db.js";
import {
  acquireBackupLock,
  createDatabaseBackup,
  getBackupInfo,
  releaseBackupLock,
} from "../lib/github-backup.js";

const LOCK_TTL_MS = 60 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ success: false, message: "CRON_SECRET is not configured." });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const action = req.query.action || "dailyBackup";
  if (action !== "dailyBackup") {
    return res.status(400).json({ success: false, message: "Unknown action" });
  }

  const info = getBackupInfo();
  if (!info.ok) {
    return res.status(503).json({ success: false, message: info.error });
  }

  let db;
  try {
    db = await connectToDatabase();
  } catch (err) {
    console.error("[cron] DB connection failed:", err.message);
    return res.status(500).json({ success: false, message: "Database unavailable" });
  }

  let lockToken = null;
  try {
    lockToken = await acquireBackupLock("cron-backup", "system", LOCK_TTL_MS);
    const backup = await createDatabaseBackup(db, {
      kind: "scheduled",
      by: "cron",
      source: "cron",
      updateHead: true,
    });
    return res.status(200).json({
      success: true,
      backup: {
        id: backup.id,
        dir: backup.dir,
        createdAt: backup.manifest.createdAt,
        collectionCount: backup.manifest.collectionCount,
        totalDocs: backup.manifest.totalDocs,
        dataBytes: backup.manifest.dataBytes,
      },
    });
  } catch (err) {
    console.error("[cron] backup failed:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
      ...(err.backup ? { backup: err.backup } : {}),
      ...(err.lock ? { lock: err.lock } : {}),
    });
  } finally {
    if (lockToken) await releaseBackupLock(lockToken);
  }
}

export const config = { maxDuration: 300 };
