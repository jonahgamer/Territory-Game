// Design and optionally write the 64-spawn 30x30 arena.
//
// Preview only (default):
//   node tools/seed-map-64spawns.mjs
//
// Write to the database:
//   node tools/seed-map-64spawns.mjs --apply
//
// The map id is the one in the admin URL. Override with MAP_ID=... if needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

const MAP_ID = process.env.MAP_ID || '899531dc-df8f-470e-ab23-bd94ab138143';
const APPLY = process.argv.includes('--apply');
const ASCII = process.argv.includes('--ascii');
const COLS = 30;
const ROWS = 30;

const cells = Array.from({ length: ROWS * COLS }, () => ({ kind: 'empty' }));
const at = (r, c) => cells[r * COLS + c];
const wall = (r, c) => {
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) at(r, c).kind = 'obstacle';
};
const spawn = (r, c) => {
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) at(r, c).kind = 'spawnpoint';
};
const rect = (r0, c0, r1, c1, kind) => {
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (kind === 'obstacle') wall(r, c);
      else spawn(r, c);
    }
  }
};

// Outer border.
for (let i = 0; i < ROWS; i += 1) { wall(i, 0); wall(i, COLS - 1); }
for (let i = 0; i < COLS; i += 1) { wall(0, i); wall(ROWS - 1, i); }

// Four open spawn quadrants are separated by a two-cell-wide central cross.
// The cross is a bridge network: obstacle walls on both sides, with gates.
// Horizontal bridge: rows 14-15; vertical bridge: columns 14-15.
for (let c = 1; c <= 28; c += 1) {
  if (![3, 4, 7, 8, 14, 15, 21, 22, 25, 26].includes(c)) { wall(13, c); wall(16, c); }
}
for (let r = 1; r <= 28; r += 1) {
  if (![3, 4, 7, 8, 14, 15, 21, 22, 25, 26].includes(r)) { wall(r, 13); wall(r, 16); }
}

// Quadrant gates connect each quadrant to both bridge directions in two places.
// Top-left: row13 c7-8 and col13 r7-8.
// Top-right: row13 c21-22 and col16 r7-8.
// Bottom-left: row16 c7-8 and col13 r21-22.
// Bottom-right: row16 c21-22 and col16 r21-22.

// Four open spawn plazas. Each has 16 spawn points on a spacing-3 lattice,
// so every pair in a plaza is at Manhattan distance at least 3.
const spawnCoords = [];
for (const r of [2, 5, 8, 11]) {
  for (const c of [2, 5, 8, 11]) spawnCoords.push([r, c]);
}
for (const r of [2, 5, 8, 11]) {
  for (const c of [18, 21, 24, 27]) spawnCoords.push([r, c]);
}
for (const r of [18, 21, 24, 27]) {
  for (const c of [2, 5, 8, 11]) spawnCoords.push([r, c]);
}
for (const r of [18, 21, 24, 27]) {
  for (const c of [18, 21, 24, 27]) spawnCoords.push([r, c]);
}
for (const [r, c] of spawnCoords) spawn(r, c);

// One-sided platform barriers inside each spawn plaza.
// A platform is a short obstacle bar with open ground on one side.
rect(4, 1, 4, 3, 'obstacle');
rect(4, 26, 4, 28, 'obstacle');
rect(25, 1, 25, 3, 'obstacle');
rect(25, 26, 25, 28, 'obstacle');


// Validate spawn spacing, local exits and connectivity to the central bridge.
const spawnSet = new Set(spawnCoords.map(([r, c]) => `${r},${c}`));
for (let i = 0; i < spawnCoords.length; i += 1) {
  for (let j = i + 1; j < spawnCoords.length; j += 1) {
    const [r1, c1] = spawnCoords[i];
    const [r2, c2] = spawnCoords[j];
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) < 3) {
      throw new Error(`Spawn points too close: ${r1},${c1} and ${r2},${c2}`);
    }
  }
}
for (const [r, c] of spawnCoords) {
  const exits = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
    .filter(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)
    .filter(([nr, nc]) => at(nr, nc).kind !== 'obstacle');
  if (exits.length < 2) throw new Error(`Spawn point ${r},${c} is too enclosed`);
}

// Every spawn must reach the central intersection (14,14) through open cells.
const seen = new Set();
const queue = [[14, 14]];
seen.add('14,14');
while (queue.length > 0) {
  const [r, c] = queue.shift();
  for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
    const key = `${nr},${nc}`;
    if (seen.has(key) || at(nr, nc).kind === 'obstacle') continue;
    seen.add(key);
    queue.push([nr, nc]);
  }
}
for (const [r, c] of spawnCoords) {
  if (!seen.has(`${r},${c}`)) throw new Error(`Spawn point ${r},${c} is cut off from the arena`);
}

let minSpawnDistance = Infinity;
for (let i = 0; i < spawnCoords.length; i += 1) {
  for (let j = i + 1; j < spawnCoords.length; j += 1) {
    const [r1, c1] = spawnCoords[i];
    const [r2, c2] = spawnCoords[j];
    minSpawnDistance = Math.min(minSpawnDistance, Math.abs(r1 - r2) + Math.abs(c1 - c2));
  }
}
let minSpawnExits = Infinity;
for (const [r, c] of spawnCoords) {
  const exits = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
    .filter(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)
    .filter(([nr, nc]) => at(nr, nc).kind !== 'obstacle');
  minSpawnExits = Math.min(minSpawnExits, exits.length);
}

const counts = {};
for (const cell of cells) counts[cell.kind] = (counts[cell.kind] || 0) + 1;

function ascii() {
  const lines = [];
  for (let r = 0; r < ROWS; r += 1) {
    let line = '';
    for (let c = 0; c < COLS; c += 1) {
      const kind = at(r, c).kind;
      line += kind === 'obstacle' ? '#' : kind === 'spawnpoint' ? 'S' : '.';
    }
    lines.push(`${String(r).padStart(2, '0')} ${line}`);
  }
  return lines.join('\n');
}

if (counts.spawnpoint !== 64) throw new Error(`Expected 64 spawn points, got ${counts.spawnpoint}`);
console.log(`Map ${MAP_ID}: ${ROWS}x${COLS}`);
console.log(counts);
console.log(`Checks: min spawn distance ${minSpawnDistance}, min open exits ${minSpawnExits}.`);
console.log('Layout: 4 open spawn plazas, 2-cell bridge cross, 16 quadrant gates, 4 one-sided platforms.');
if (ASCII) console.log(ascii());

if (!APPLY) {
  console.log('\nPreview only. Add --apply to write this map to the database.');
  process.exit(0);
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not set.');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'territory_game');
const maps = db.collection('maps');
const meta = db.collection('meta');
const session = client.startSession();
let revision = null;
try {
  await session.withTransaction(async () => {
    const result = await maps.updateOne(
      { id: MAP_ID },
      { $set: { cols: COLS, rows: ROWS, cells, updatedAt: new Date() } },
      { session }
    );
    if (result.matchedCount !== 1) throw new Error(`Map ${MAP_ID} was not found.`);
    await meta.updateOne(
      { _id: 'maps' },
      { $inc: { revision: 1 }, $set: { updatedAt: new Date() } },
      { upsert: true, session }
    );
    const doc = await meta.findOne({ _id: 'maps' }, { session });
    revision = doc?.revision ?? null;
  });
} finally {
  await session.endSession();
  await client.close();
}
console.log(`\nUpdated map ${MAP_ID}; maps revision is now ${revision}.`);
