// lib/github-backup.js
//
// Full-database snapshots in a private GitHub repository.
//
// Layout:
//   database/_state.json                 current head + branch
//   database/_lock.json                  short-lived writer lock
//   database/<id>/_manifest.json         backup metadata, written last
//   database/<id>/<collection>.json      EJSON payload { collection, count, docs }
//
// The tree is logical, not a GitHub git branch: a backup records `parent` and
// `branch`, so a restore can start a new branch from an older snapshot while
// the safety snapshot stays on the old branch.

import crypto from "node:crypto";
import { BSON } from "mongodb";

const { EJSON } = BSON;

const DEFAULT_API_BASE = "https://api.github.com";
const BACKUP_ROOT = "database";
const STATE_PATH = `${BACKUP_ROOT}/_state.json`;
const LOCK_PATH = `${BACKUP_ROOT}/_lock.json`;
const TREE_TTL_MS = 15_000;
const BATCH_SIZE = 500;

const BACKUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const COLLECTION_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$/;

let _treeCache = { branch: "", apiBase: "", tree: null, expireAt: 0 };
let _repoInitPromise = null;

function getBackupConfig() {
  const token = process.env.GITHUB_BACKUP_TOKEN
    || process.env.GITHUB_IMAGES_TOKEN
    || process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_BACKUP_OWNER
    || process.env.GITHUB_IMAGES_OWNER
    || process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_BACKUP_REPO
    || process.env.GITHUB_IMAGES_REPO
    || process.env.GITHUB_REPO
    || "backup";
  const branch = process.env.GITHUB_BACKUP_BRANCH
    || process.env.GITHUB_IMAGES_BRANCH
    || process.env.GITHUB_BRANCH
    || "main";
  const apiBase = (process.env.GITHUB_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");

  if (!token || !owner) {
    throw new Error("GitHub backup is not configured (set GITHUB_BACKUP_TOKEN and GITHUB_BACKUP_OWNER)");
  }
  return { token, owner, repo, branch, apiBase };
}

export function getBackupInfo() {
  try {
    const { owner, repo, branch } = getBackupConfig();
    return { ok: true, owner, repo, branch };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export function backupConfigured() {
  return getBackupInfo().ok;
}

function encodePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

function invalidateTree() {
  _treeCache = { branch: "", apiBase: "", tree: null, expireAt: 0 };
}

function isEmptyRepositoryError(err) {
  const text = `${err?.github || ""} ${err?.message || ""}`;
  return err?.status === 409 && /Git Repository is empty/i.test(text);
}

// A brand-new private GitHub repository has no commit, so trees/contents by
// branch return 409 "Git Repository is empty." Create the first commit and
// branch with the Git Data API before the normal Contents API flow.
async function ensureBackupRepository() {
  if (_repoInitPromise) return _repoInitPromise;

  _repoInitPromise = (async () => {
    const { owner, repo, branch } = getBackupConfig();
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

    const readme = "# Territory Game backups\n\nPrivate database snapshots.\n";
    const blob = await ghJson(`${base}/git/blobs`, {
      method: "POST",
      body: {
        content: Buffer.from(readme, "utf8").toString("base64"),
        encoding: "base64",
      },
    });
    const tree = await ghJson(`${base}/git/trees`, {
      method: "POST",
      body: {
        tree: [
          { path: "README.md", mode: "100644", type: "blob", sha: blob.sha },
        ],
      },
    });
    const commit = await ghJson(`${base}/git/commits`, {
      method: "POST",
      body: {
        message: "Initialize backup repository",
        tree: tree.sha,
      },
    });

    try {
      await ghJson(`${base}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${branch}`, sha: commit.sha },
      });
    } catch (err) {
      // Another request initialized the same branch first.
      if (err.status !== 422) throw err;
    }
    invalidateTree();
    return true;
  })();

  try {
    return await _repoInitPromise;
  } finally {
    _repoInitPromise = null;
  }
}

async function ghRequest(path, options = {}) {
  const { token, apiBase } = getBackupConfig();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "territory-game-backup",
    ...(options.headers || {}),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${apiBase}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return res;
}

async function ghJson(path, options = {}) {
  const res = await ghRequest(path, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`GitHub ${res.status}: ${text.slice(0, 300) || res.statusText}`);
    err.status = res.status;
    err.github = text.slice(0, 1000);
    throw err;
  }
  return res.json();
}

async function getTree(force = false, allowInitialize = true) {
  const { branch, apiBase } = getBackupConfig();
  const now = Date.now();
  if (!force && _treeCache.tree && _treeCache.branch === branch
    && _treeCache.apiBase === apiBase && _treeCache.expireAt > now) {
    return _treeCache.tree;
  }

  let data;
  try {
    data = await ghJson(
      `/repos/${encodeURIComponent(getBackupConfig().owner)}/${encodeURIComponent(getBackupConfig().repo)}`
      + `/git/trees/${encodeURIComponent(branch)}?recursive=1`
    );
  } catch (err) {
    if (isEmptyRepositoryError(err) && allowInitialize) {
      await ensureBackupRepository();
      return getTree(true, false);
    }
    throw err;
  }
  if (data.truncated) {
    throw new Error("GitHub returned a truncated backup tree; the backup repository is too large to list.");
  }
  const tree = Array.isArray(data.tree) ? data.tree : [];
  _treeCache = { branch, apiBase, tree, expireAt: now + TREE_TTL_MS };
  return tree;
}

async function readBlobText(sha) {
  const { owner, repo } = getBackupConfig();
  const data = await ghJson(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`
  );
  if (data.encoding === "base64") {
    return Buffer.from(String(data.content || "").replace(/\s+/g, ""), "base64").toString("utf8");
  }
  return String(data.content || "");
}

async function getContentMeta(path, allowInitialize = true) {
  const { owner, repo, branch } = getBackupConfig();
  const res = await ghRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    + `/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 409 && /Git Repository is empty/i.test(text) && allowInitialize) {
      await ensureBackupRepository();
      return getContentMeta(path, false);
    }
    const err = new Error(`GitHub contents ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.github = text.slice(0, 1000);
    throw err;
  }
  return res.json();
}

async function putFileText(path, text, message, options = {}) {
  const { owner, repo, branch } = getBackupConfig();
  const body = {
    message,
    content: Buffer.from(text, "utf8").toString("base64"),
    branch,
  };
  if (options.sha) body.sha = options.sha;

  const res = await ghRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`,
    { method: "PUT", body }
  );
  if (!res.ok) {
    const responseText = await res.text().catch(() => "");
    const err = new Error(`GitHub backup PUT failed (${res.status}): ${responseText.slice(0, 300)}`);
    err.status = res.status;
    err.github = responseText.slice(0, 1000);
    throw err;
  }
  const data = await res.json();
  invalidateTree();
  return {
    path,
    sha: data?.content?.sha || null,
    size: Buffer.byteLength(text, "utf8"),
    githubUrl: `https://github.com/${owner}/${repo}/blob/${branch}/${path}`,
  };
}

async function deleteFile(path, message) {
  const meta = await getContentMeta(path);
  if (!meta) return false;
  const { owner, repo } = getBackupConfig();
  const res = await ghRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`,
    {
      method: "DELETE",
      body: { message, sha: meta.sha, branch: getBackupConfig().branch },
    }
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub DELETE ${res.status}: ${text.slice(0, 200)}`);
  }
  invalidateTree();
  return true;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${err.message}`);
  }
}

function decodeBase64Content(meta) {
  if (!meta || !meta.content) return "";
  return Buffer.from(String(meta.content).replace(/\s+/g, ""), "base64").toString("utf8");
}

export function makeBackupId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function makeBranchName(prefix = "restore", date = new Date()) {
  return `${prefix}-${makeBackupId(date)}`;
}

export function isBackupId(value) {
  return typeof value === "string" && BACKUP_ID_RE.test(value);
}

export function timestampFromId(id) {
  const m = String(id).match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z?$/);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5] || "000"}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export async function readBackupState() {
  const tree = await getTree();
  const node = tree.find((item) => item.type === "blob" && item.path === STATE_PATH);
  if (!node) return { version: 1, head: null, branch: "main", updatedAt: null };
  try {
    const parsed = parseJson(await readBlobText(node.sha), STATE_PATH);
    return {
      version: 1,
      ...parsed,
      head: typeof parsed.head === "string" && parsed.head ? parsed.head : null,
      branch: typeof parsed.branch === "string" && parsed.branch ? parsed.branch : "main",
    };
  } catch (err) {
    console.error("[backup] state file unreadable:", err.message);
    return { version: 1, head: null, branch: "main", updatedAt: null };
  }
}

export async function writeBackupState(patch, message = "backup: update state") {
  for (let attempt = 0; attempt < 4; attempt++) {
    const meta = await getContentMeta(STATE_PATH);
    let current = {};
    if (meta) {
      try { current = parseJson(decodeBase64Content(meta), STATE_PATH); }
      catch { current = {}; }
    }
    const next = {
      version: 1,
      branch: "main",
      ...current,
      ...(patch || {}),
      updatedAt: new Date().toISOString(),
    };
    try {
      await putFileText(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`, message, {
        sha: meta?.sha,
      });
      return next;
    } catch (err) {
      if ((err.status === 409 || err.status === 422) && attempt < 3) continue;
      throw err;
    }
  }
  throw new Error("Could not update the backup state file.");
}

export async function acquireBackupLock(action, owner, ttlMs = 30 * 60 * 1000) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const meta = await getContentMeta(LOCK_PATH);
    if (meta) {
      let current = null;
      try { current = parseJson(decodeBase64Content(meta), LOCK_PATH); }
      catch { current = null; }
      if (current && Number(current.expiresAt) > Date.now()) {
        const err = new Error(
          `Another backup operation is already running (${current.action || "unknown"} by ${current.owner || "unknown"}).`
        );
        err.status = 409;
        err.lock = {
          action: current.action || "unknown",
          owner: current.owner || "unknown",
          startedAt: current.startedAt || null,
          expiresAt: current.expiresAt || null,
        };
        throw err;
      }
    }

    const token = crypto.randomUUID();
    const payload = {
      token,
      action,
      owner,
      startedAt: new Date().toISOString(),
      expiresAt: Date.now() + ttlMs,
    };
    try {
      await putFileText(LOCK_PATH, `${JSON.stringify(payload, null, 2)}\n`, `backup: lock ${action}`, {
        sha: meta?.sha,
      });
      return token;
    } catch (err) {
      if ((err.status === 409 || err.status === 422) && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error("Could not acquire the backup lock.");
}

export async function releaseBackupLock(token) {
  try {
    const meta = await getContentMeta(LOCK_PATH);
    if (!meta) return false;
    let current = null;
    try { current = parseJson(decodeBase64Content(meta), LOCK_PATH); }
    catch { current = null; }
    if (!current || current.token !== token) return false;
    await deleteFile(LOCK_PATH, "backup: release lock");
    return true;
  } catch (err) {
    console.error("[backup] release lock failed:", err.message);
    return false;
  }
}

function dataFilesFor(files) {
  return files.filter((file) => (
    file.name.endsWith(".json")
    && file.name !== "_manifest.json"
    && !file.name.startsWith("_")
    && !file.name.includes("/")
  ));
}

function collectionNameFromFile(name) {
  return name.replace(/\.json$/i, "");
}

function isValidCollection(name) {
  return COLLECTION_RE.test(name)
    && !name.startsWith("system.")
    && !["__proto__", "prototype", "constructor"].includes(name);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

function reviveLegacyValue(value, key = "") {
  if (value instanceof Date || value instanceof BSON.ObjectId) return value;
  if (Array.isArray(value)) return value.map((item) => reviveLegacyValue(item, key));
  if (value && typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = reviveLegacyValue(childValue, childKey);
    }
    return out;
  }
  if (typeof value === "string") {
    if (key === "_id" && OBJECT_ID_RE.test(value)) return new BSON.ObjectId(value);
    if (/(At|Date|Time)$/.test(key) && ISO_DATE_RE.test(value)) return new Date(value);
  }
  return value;
}

function countValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value && typeof value === "object" && value.count !== undefined) {
    const count = Number(value.count);
    return Number.isFinite(count) ? count : null;
  }
  return null;
}

export async function listBackups() {
  const tree = await getTree();
  const state = await readBackupState();
  const groups = new Map();

  for (const node of tree) {
    if (node.type !== "blob" || !node.path.startsWith(`${BACKUP_ROOT}/`)) continue;
    const rest = node.path.slice(BACKUP_ROOT.length + 1);
    const slash = rest.indexOf("/");
    if (slash < 1) continue;
    const id = rest.slice(0, slash);
    const name = rest.slice(slash + 1);
    if (!BACKUP_ID_RE.test(id) || !name) continue;

    let group = groups.get(id);
    if (!group) {
      group = { id, dir: `${BACKUP_ROOT}/${id}`, files: [], totalSize: 0 };
      groups.set(id, group);
    }
    group.files.push({ name, path: node.path, size: Number(node.size) || 0, sha: node.sha });
    group.totalSize += Number(node.size) || 0;
  }

  const backups = [];
  for (const group of groups.values()) {
    const manifestFile = group.files.find((file) => file.name === "_manifest.json");
    const startedFile = group.files.find((file) => file.name === "_started.json");
    const dataFiles = dataFilesFor(group.files);
    let manifest = null;
    let manifestError = null;
    let legacy = false;

    if (manifestFile) {
      try {
        manifest = parseJson(await readBlobText(manifestFile.sha), `${group.dir}/_manifest.json`);
      } catch (err) {
        manifestError = err.message;
      }
    } else if (!startedFile && dataFiles.length > 0) {
      // Compatibility with the reference uploader: its daily cron wrote
      // collection files without a manifest. New backups write
      // _started.json first, so an interrupted new backup stays incomplete.
      legacy = true;
      manifest = {
        app: "territory-game",
        legacy: true,
        id: group.id,
        createdAt: timestampFromId(group.id),
        kind: "legacy",
        parent: null,
        branch: state.branch || "main",
        by: "",
        source: "legacy",
        collections: Object.fromEntries(dataFiles.map((file) => [
          collectionNameFromFile(file.name),
          null,
        ])),
        totalDocs: null,
      };
    }

    const manifestCollections = manifest && manifest.collections && typeof manifest.collections === "object"
      ? manifest.collections
      : {};
    const collections = {};
    for (const [name, value] of Object.entries(manifestCollections)) {
      if (isValidCollection(name)) collections[name] = countValue(value);
    }
    for (const file of dataFiles) {
      const name = collectionNameFromFile(file.name);
      if (isValidCollection(name) && !(name in collections)) collections[name] = null;
    }

    const collectionNames = Object.keys(collections).filter(isValidCollection);
    const missingFiles = collectionNames.filter((name) => (
      !dataFiles.some((file) => collectionNameFromFile(file.name) === name)
    ));
    const knownCounts = collectionNames
      .map((name) => collections[name])
      .filter((count) => Number.isFinite(count));
    const manifestDocs = Number(manifest?.totalDocs);
    const totalDocs = legacy
      ? null
      : (Number.isFinite(manifestDocs)
        ? manifestDocs
        : knownCounts.reduce((sum, count) => sum + count, 0));

    const createdAt = manifest?.createdAt
      || manifest?.timestamp
      || timestampFromId(group.id)
      || null;

    backups.push({
      id: group.id,
      dir: group.dir,
      createdAt,
      kind: typeof manifest?.kind === "string" ? manifest.kind : (manifest ? "legacy" : "incomplete"),
      parent: typeof manifest?.parent === "string" && manifest.parent ? manifest.parent : null,
      branch: typeof manifest?.branch === "string" && manifest.branch
        ? manifest.branch
        : (state.branch || "main"),
      by: typeof manifest?.by === "string" ? manifest.by : "",
      source: typeof manifest?.source === "string" ? manifest.source : "",
      collectionCount: collectionNames.length,
      collections,
      totalDocs,
      totalSize: group.totalSize,
      fileCount: group.files.length,
      dataFileCount: dataFiles.length,
      hasManifest: Boolean(manifestFile),
      legacy: Boolean(legacy || manifest?.legacy || (manifest && !manifest.kind)),
      manifestError,
      missingFiles,
      complete: Boolean(manifest && !manifestError && missingFiles.length === 0 && dataFiles.length > 0),
      restorable: Boolean(manifest && !manifestError && missingFiles.length === 0 && dataFiles.length > 0),
      isHead: state.head === group.id,
    });
  }

  backups.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (bt !== at) return bt - at;
    return String(b.id).localeCompare(String(a.id));
  });

  let head = state.head;
  const headNode = head ? backups.find((backup) => backup.id === head) : null;
  if (!headNode || !headNode.restorable) {
    head = backups.find((backup) => backup.restorable)?.id || null;
  }

  return {
    backups,
    state: { ...state, head },
  };
}

export async function readBackup(id) {
  if (!isBackupId(id)) {
    const err = new Error("Invalid backup id.");
    err.status = 400;
    throw err;
  }

  const dir = `${BACKUP_ROOT}/${id}`;
  const tree = await getTree();
  const files = tree
    .filter((node) => node.type === "blob" && node.path.startsWith(`${dir}/`))
    .map((node) => ({
      name: node.path.slice(dir.length + 1),
      path: node.path,
      sha: node.sha,
      size: Number(node.size) || 0,
    }))
    .filter((file) => file.name && !file.name.includes("/"));

  const manifestFile = files.find((file) => file.name === "_manifest.json");
  const startedFile = files.find((file) => file.name === "_started.json");
  const dataFiles = dataFilesFor(files);
  if (dataFiles.length === 0) {
    const err = new Error("This backup contains no data files.");
    err.status = 400;
    throw err;
  }
  if (!manifestFile && startedFile) {
    const err = new Error("This backup was interrupted before its manifest was written.");
    err.status = 409;
    throw err;
  }

  const manifest = manifestFile
    ? parseJson(await readBlobText(manifestFile.sha), `${dir}/_manifest.json`)
    : {
        app: "territory-game",
        legacy: true,
        id,
        kind: "legacy",
        totalDocs: null,
        collections: Object.fromEntries(dataFiles.map((file) => [
          collectionNameFromFile(file.name),
          null,
        ])),
      };

  const collections = [];
  for (const file of dataFiles) {
    const name = collectionNameFromFile(file.name);
    if (!isValidCollection(name)) {
      const err = new Error(`Unsafe collection name in backup: ${name}`);
      err.status = 400;
      throw err;
    }
    let payload;
    try {
      payload = reviveLegacyValue(EJSON.parse(await readBlobText(file.sha)));
    } catch (err) {
      const wrapped = new Error(`Cannot parse ${file.name}: ${err.message}`);
      wrapped.status = 400;
      throw wrapped;
    }
    const docs = Array.isArray(payload) ? payload : payload?.docs;
    if (!Array.isArray(docs)) {
      const err = new Error(`${file.name} does not contain a docs array.`);
      err.status = 400;
      throw err;
    }
    if (payload?.collection && payload.collection !== name) {
      const err = new Error(`${file.name} says collection ${payload.collection}, expected ${name}.`);
      err.status = 400;
      throw err;
    }
    if (payload?.count !== undefined && Number(payload.count) !== docs.length) {
      const err = new Error(`${file.name} count does not match its document array.`);
      err.status = 400;
      throw err;
    }

    const seenIds = new Set();
    for (const doc of docs) {
      if (doc && doc._id !== undefined && doc._id !== null) {
        const key = String(doc._id);
        if (seenIds.has(key)) {
          const err = new Error(`${file.name} contains a duplicate _id: ${key}`);
          err.status = 400;
          throw err;
        }
        seenIds.add(key);
      }
    }

    collections.push({ name, docs });
  }

  const expected = manifest?.collections && typeof manifest.collections === "object"
    ? manifest.collections
    : {};
  const expectedNames = Object.keys(expected).filter(isValidCollection);
  for (const [name, count] of Object.entries(expected)) {
    if (!isValidCollection(name)) continue;
    const found = collections.find((collection) => collection.name === name);
    if (!found) {
      const err = new Error(`Backup manifest lists ${name}, but its file is missing.`);
      err.status = 400;
      throw err;
    }
    const expectedCount = countValue(count);
    if (expectedCount !== null && expectedCount !== found.docs.length) {
      const err = new Error(`Backup manifest count for ${name} does not match the file.`);
      err.status = 400;
      throw err;
    }
  }
  if (expectedNames.length) {
    for (const collection of collections) {
      if (!expectedNames.includes(collection.name)) {
        const err = new Error(`Backup contains ${collection.name}, but the manifest does not list it.`);
        err.status = 400;
        throw err;
      }
    }
  }

  return {
    id,
    dir,
    manifest,
    collections,
    totalDocs: collections.reduce((sum, collection) => sum + collection.docs.length, 0),
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
  };
}

async function listDataCollections(db) {
  const list = await db.listCollections({}, { nameOnly: false }).toArray();
  return list
    .filter((item) => item.type !== "view")
    .map((item) => item.name)
    .filter((name) => typeof name === "string" && isValidCollection(name))
    .sort();
}

export async function getLiveDatabaseStats(db) {
  const names = await listDataCollections(db);
  const collections = {};
  let totalDocs = 0;
  for (const name of names) {
    const count = await db.collection(name).countDocuments({});
    collections[name] = count;
    totalDocs += count;
  }
  return { collections, totalCollections: names.length, totalDocs };
}

export async function createDatabaseBackup(db, options = {}) {
  const state = options.state || await readBackupState();
  const id = options.id || makeBackupId();
  if (!isBackupId(id)) throw new Error("Invalid backup id.");

  const kind = options.kind || "manual";
  const by = options.by || "system";
  const source = options.source || "manual";
  let parent = options.parent !== undefined ? options.parent : (state.head || null);
  let branch = options.branch || state.branch || "main";

  // If _state.json was lost, continue from the newest restorable snapshot
  // instead of creating a disconnected root.
  if (options.parent === undefined && !parent) {
    try {
      const listed = await listBackups();
      if (listed.state.head) {
        parent = listed.state.head;
        if (!options.branch && listed.state.branch) branch = listed.state.branch;
      }
    } catch (err) {
      console.error("[backup] could not recover the previous head:", err.message);
    }
  }

  const createdAt = new Date().toISOString();
  const dir = `${BACKUP_ROOT}/${id}`;
  const names = await listDataCollections(db);

  const manifest = {
    app: "territory-game",
    schemaVersion: 1,
    format: "ejson",
    id,
    createdAt,
    kind,
    by,
    source,
    parent: parent || null,
    branch,
    collectionCount: names.length,
    collections: {},
    totalDocs: 0,
    dataBytes: 0,
    restoredFrom: options.restoredFrom || null,
    safetyBackup: options.safetyBackup || null,
  };
  const results = [];

  // Written first. If the process dies before _manifest.json, the directory
  // is still marked incomplete instead of being mistaken for a legacy backup.
  await putFileText(
    `${dir}/_started.json`,
    `${JSON.stringify({ id, createdAt, kind, by, source, collectionCount: names.length }, null, 2)}\n`,
    `backup ${id}: start (${names.length} collections)`,
  );

  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    const text = EJSON.stringify({ collection: name, count: docs.length, docs }, null, 2);
    const textBytes = Buffer.byteLength(text, "utf8");
    if (textBytes > 75 * 1024 * 1024) {
      throw new Error(`Collection ${name} is too large for a GitHub Contents API file (${(textBytes / 1024 / 1024).toFixed(1)} MB).`);
    }
    const uploaded = await putFileText(
      `${dir}/${name}.json`,
      text,
      `backup ${id}: ${name} (${docs.length} docs)`,
    );
    manifest.collections[name] = docs.length;
    manifest.totalDocs += docs.length;
    manifest.dataBytes += uploaded.size;
    results.push({ collection: name, count: docs.length, size: uploaded.size });
  }

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestUpload = await putFileText(
    `${dir}/_manifest.json`,
    manifestText,
    `backup ${id}: manifest (${names.length} collections, ${manifest.totalDocs} docs)`,
  );

  let stateResult = null;
  try {
    if (options.updateHead !== false) {
      stateResult = await writeBackupState({
        head: id,
        branch,
        reason: kind,
        ...(options.restoredFrom ? { restoredFrom: options.restoredFrom } : {}),
        ...(options.safetyBackup ? { safetyBackup: options.safetyBackup } : {}),
        updatedAt: new Date().toISOString(),
      }, `backup ${id}: move head to ${id}`);
    }
  } catch (err) {
    err.backup = { id, dir, manifest, results, manifestSize: manifestUpload.size };
    throw err;
  }

  return {
    id,
    dir,
    manifest,
    results,
    manifestSize: manifestUpload.size,
    state: stateResult,
  };
}

export async function restoreDatabaseFromBackup(db, backup) {
  if (!backup || !Array.isArray(backup.collections)) {
    throw new Error("Backup payload is invalid.");
  }

  const targetNames = new Set(backup.collections.map((collection) => collection.name));
  const currentNames = await listDataCollections(db);
  const results = [];
  let totalDocs = 0;

  try {
    for (const { name, docs } of backup.collections) {
      if (!isValidCollection(name)) throw new Error(`Unsafe collection name: ${name}`);
      const collection = db.collection(name);
      await collection.deleteMany({});
      for (let index = 0; index < docs.length; index += BATCH_SIZE) {
        const batch = docs.slice(index, index + BATCH_SIZE);
        if (batch.length) {
          await collection.insertMany(batch, { ordered: false });
        }
      }
      totalDocs += docs.length;
      results.push({ collection: name, count: docs.length, action: "restored" });
    }

    for (const name of currentNames) {
      if (targetNames.has(name)) continue;
      await db.collection(name).drop();
      results.push({ collection: name, count: 0, action: "dropped" });
    }
  } catch (err) {
    err.partialResults = results;
    throw err;
  }

  return {
    results,
    totalDocs,
    collectionsRestored: results.filter((result) => result.action === "restored").length,
    collectionsDropped: results.filter((result) => result.action === "dropped").length,
  };
}
