// api/territory.js
//
// Territory Game backend — single endpoint, action-based.
//
// Routes:
//   GET  /api/territory?action=bootstrap          → { maps, problems, contests, user }
//   POST /api/territory  { action: 'save-maps',     maps }
//   POST /api/territory  { action: 'save-problems', problems }
//   POST /api/territory  { action: 'test-problem', logic, expected, answer }  (admin test, no DB write)
//   POST /api/territory  { action: 'save-contests', contests }
//   POST /api/territory  { action: 'save-team', contestId, name, members }
//   POST /api/territory  { action: 'remove-team', contestId, teamId }
//   POST /api/territory  { action: 'choose-spawn', contestId, cell }
//   POST /api/territory  { action: 'solve', contestId, cell, answer }
//   POST /api/territory  { action: 'contest-state', contestId }
//   GET  /api/territory?action=list-accounts
//   POST /api/territory  { action: 'create-account', username, displayName, password }
//   POST /api/territory  { action: 'update-account', username, displayName?, password?, banned? }
//   POST /api/territory  { action: 'delete-account', username }
//   POST /api/territory  { action: 'add-version', version, message }
//
// Map and problem writes, contest saves, team changes, and account changes are admin-only.
// Choosing a spawn point and solving a problem are for a student on a team.

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { applyCors, connectToDatabase, getMongoClient } from './_db.js';
import { runProblemLogic } from './logic.js';

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
const MAX_PROBLEM_NO = 99999;
const PROBLEM_YEAR = 26;
const MAX_PROBLEM_TEXT = 50000;
const MAX_PROBLEM_LOGIC = 10000;
const MAX_TEST_TEXT = 10000;
const MAX_NAME_LEN = 60;
const MAX_MAP_PHOTO = 700000;
const MAX_CONTESTANT_ID_LEN = 80;
const MAX_CONTEST_MINUTES = 10080;
const MIN_START_AT = Date.parse('2000-01-01T00:00:00Z');
const MAX_START_AT = Date.parse('2100-01-01T00:00:00Z');
const PROBLEM_TYPES = ['math', 'oi', 'science', 'puzzle', 'testing'];
const DIFFICULTIES = ['easy', 'normal', 'hard', 'insane'];
const DIFFICULTY_SCORE = { easy: 1, normal: 2, hard: 3, insane: 4 };

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

function cleanCell(cell) {
  if (!cell || typeof cell !== 'object') return null;
  if (cell.kind === 'empty' || cell.kind === 'obstacle' || cell.kind === 'spawnpoint') {
    return { kind: cell.kind };
  }
  if (cell.kind === 'problem') {
    if (!Number.isInteger(cell.problemNo)
      || cell.problemNo < MIN_PROBLEM_NO
      || cell.problemNo > MAX_PROBLEM_NO
      || !PROBLEM_TYPES.includes(cell.type)) return null;
    return { kind: 'problem', problemNo: cell.problemNo, type: cell.type };
  }
  return null;
}

function cleanMapPhoto(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_MAP_PHOTO) return '';
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return '';
  return value;
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
  const cells = v.cells.map(cleanCell);
  if (cells.some((cell) => !cell)) return null;
  const photo = cleanMapPhoto(v.photo);
  const backdrop = v.backdrop === 'photo' && photo ? 'photo' : 'terrain';
  return {
    id: v.id,
    name,
    cols: v.cols,
    rows: v.rows,
    cells,
    mode: v.mode === 'testing' ? 'testing' : 'official',
    backdrop,
    photo: backdrop === 'photo' ? photo : '',
  };
}

function normalizeProblem(v) {
  if (!v || typeof v !== 'object') return null;
  if (!Number.isInteger(v.index) || v.index < MIN_PROBLEM_NO || v.index > MAX_PROBLEM_NO) return null;
  if (!PROBLEM_TYPES.includes(v.type)) return null;
  if (typeof v.prompt !== 'string' || v.prompt.length > MAX_PROBLEM_TEXT) return null;
  if (typeof v.answer !== 'string' || v.answer.length > MAX_PROBLEM_TEXT) return null;
  const logic = typeof v.logic === 'string' ? v.logic : '';
  if (logic.length > MAX_PROBLEM_LOGIC) return null;
  return {
    index: v.index,
    type: v.type,
    prompt: v.prompt,
    answer: v.answer,
    logic,
    difficulty: DIFFICULTIES.includes(v.difficulty) ? v.difficulty : 'normal',
  };
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  const id = value.trim();
  if (!id || id.length > MAX_CONTESTANT_ID_LEN) return '';
  return id;
}

function cleanTeams(value) {
  if (!Array.isArray(value)) return [];
  const teams = [];
  const seen = new Set();
  for (const team of value) {
    if (!team || typeof team !== 'object') continue;
    const id = cleanId(team.id);
    const name = typeof team.name === 'string' ? team.name.trim() : '';
    const members = [];
    for (const member of Array.isArray(team.members) ? team.members.map(cleanId).filter(Boolean) : []) {
      if (members.some((item) => sameName(item, member))) continue;
      members.push(member);
    }
    if (!id || !name || name.length > MAX_NAME_LEN || members.length < 1 || members.length > 5) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    teams.push({ id, name, members });
  }
  return teams;
}

function cleanTeamCells(value) {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const teamId = cleanId(item.teamId);
    if (!teamId || !Number.isInteger(item.cell) || item.cell < 0) continue;
    const existing = items.findIndex((entry) => entry.teamId === teamId);
    if (existing >= 0) items.splice(existing, 1);
    items.push({ teamId, cell: item.cell });
  }
  return items;
}

function cleanSpawnVotes(value) {
  if (!Array.isArray(value)) return [];
  const votes = [];
  for (const vote of value) {
    if (!vote || typeof vote !== 'object') continue;
    const teamId = cleanId(vote.teamId);
    const username = cleanId(vote.username);
    if (!teamId || !username || !Number.isInteger(vote.cell) || vote.cell < 0) continue;
    const existing = votes.findIndex((item) => item.teamId === teamId && sameName(item.username, username));
    if (existing >= 0) votes.splice(existing, 1);
    votes.push({ teamId, username, cell: vote.cell });
  }
  return votes;
}

function agreedSpawnChoices(teams, votes) {
  const choices = [];
  for (const team of teams) {
    const mine = votes.filter((vote) => vote.teamId === team.id && team.members.some((member) => sameName(member, vote.username)));
    if (mine.length !== team.members.length) continue;
    const cell = mine[0].cell;
    if (!mine.every((vote) => vote.cell === cell)) continue;
    choices.push({ teamId: team.id, cell });
  }
  return choices;
}

function cleanClaims(value) {
  if (!Array.isArray(value)) return [];
  const claims = [];
  const seen = new Set();
  for (const claim of value) {
    if (!claim || typeof claim !== 'object') continue;
    const teamId = cleanId(claim.teamId);
    const solvedBy = cleanId(claim.solvedBy);
    if (!teamId || !Number.isInteger(claim.cell) || claim.cell < 0 || seen.has(claim.cell)) continue;
    seen.add(claim.cell);
    claims.push({
      cell: claim.cell,
      teamId,
      solvedBy,
      solvedAt: Number.isFinite(claim.solvedAt) ? claim.solvedAt : 0,
    });
  }
  return claims;
}

function sameName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function teamForUser(contest, username) {
  const name = cleanId(username);
  if (!name) return null;
  return cleanTeams(contest?.teams).find((team) => team.members.some((member) => sameName(member, name))) || null;
}

function spawnCellIndexes(map) {
  if (!map || !Array.isArray(map.cells)) return [];
  return map.cells.map((cell, index) => (cell?.kind === 'spawnpoint' ? index : -1)).filter((index) => index >= 0);
}

function problemCellIndexes(map) {
  if (!map || !Array.isArray(map.cells)) return [];
  return map.cells.map((cell, index) => (cell?.kind === 'problem' ? index : -1)).filter((index) => index >= 0);
}

export function shuffleItems(list) {
  const copy = list.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const held = copy[index];
    copy[index] = copy[swap];
    copy[swap] = held;
  }
  return copy;
}

export function resolveSpawns(spawnCells, teams, choices) {
  const roster = cleanTeams(teams);
  const validCells = new Set(spawnCells.filter((cell) => Number.isInteger(cell) && cell >= 0));
  const byCell = new Map();
  for (const choice of cleanTeamCells(choices)) {
    if (!roster.some((team) => team.id === choice.teamId) || !validCells.has(choice.cell)) continue;
    for (const ids of byCell.values()) {
      const index = ids.indexOf(choice.teamId);
      if (index >= 0) ids.splice(index, 1);
    }
    const list = byCell.get(choice.cell) || [];
    list.push(choice.teamId);
    byCell.set(choice.cell, list);
  }

  const assigned = new Map();
  const displaced = [];
  for (const [cell, ids] of byCell) {
    if (ids.length === 0) continue;
    const order = shuffleItems(ids);
    assigned.set(order[0], cell);
    displaced.push(...order.slice(1));
  }

  const used = new Set(assigned.values());
  const free = shuffleItems([...validCells].filter((cell) => !used.has(cell)));
  const waiting = shuffleItems([
    ...displaced,
    ...roster.map((team) => team.id).filter((id) => !assigned.has(id) && !displaced.includes(id)),
  ]);
  for (const teamId of waiting) {
    const cell = free.shift();
    if (cell === undefined) break;
    assigned.set(teamId, cell);
  }
  return [...assigned].map(([teamId, cell]) => ({ teamId, cell }));
}

function territoryCells(contest, teamId) {
  const owned = new Set();
  for (const spawn of cleanTeamCells(contest?.spawns)) {
    if (spawn.teamId === teamId) owned.add(spawn.cell);
  }
  for (const claim of cleanClaims(contest?.claims)) {
    if (claim.teamId === teamId) owned.add(claim.cell);
  }
  return owned;
}

function adjacentToTeam(map, contest, teamId, cell) {
  const cols = map.cols;
  const row = Math.floor(cell / cols);
  const column = cell % cols;
  const owned = territoryCells(contest, teamId);
  const neighbors = [];
  if (column > 0) neighbors.push(cell - 1);
  if (column + 1 < cols) neighbors.push(cell + 1);
  if (row > 0) neighbors.push(cell - cols);
  if (row + 1 < map.rows) neighbors.push(cell + cols);
  return neighbors.some((index) => owned.has(index));
}

function allProblemsClaimed(map, claims) {
  const problems = problemCellIndexes(map);
  if (problems.length === 0) return false;
  const claimed = new Set(cleanClaims(claims).map((claim) => claim.cell));
  return problems.every((index) => claimed.has(index));
}

function problemDifficulty(problem) {
  return DIFFICULTIES.includes(problem?.difficulty) ? problem.difficulty : 'normal';
}

export function answersMatch(expected, given) {
  if (typeof expected !== 'string' || !expected.trim()) return false;
  return expected.trim().toLowerCase() === String(given ?? '').trim().toLowerCase();
}

function buildLeaderboard(contest, map, problems) {
  const claims = cleanClaims(contest?.claims);
  const spawns = cleanTeamCells(contest?.spawns);
  return cleanTeams(contest?.teams).map((team) => {
    let score = 0;
    let solved = 0;
    let territory = spawns.some((spawn) => spawn.teamId === team.id) ? 1 : 0;
    for (const claim of claims) {
      if (claim.teamId !== team.id) continue;
      territory += 1;
      const cell = map?.cells?.[claim.cell];
      if (!cell || cell.kind !== 'problem') continue;
      const problem = (problems || []).find((item) => item.index === cell.problemNo && item.type === cell.type);
      score += DIFFICULTY_SCORE[problemDifficulty(problem)];
      solved += 1;
    }
    return { teamId: team.id, name: team.name, score, solved, territory };
  }).sort((a, b) => b.score - a.score || b.solved - a.solved || a.name.localeCompare(b.name));
}

function isTestingContest(contest) {
  return contest?.mode === 'testing';
}

function cleanResolvedTeams(value) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const raw of value) {
    const id = cleanId(raw);
    if (!id || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

function playableContestMap(map, contest) {
  if (!map || isTestingContest(contest) || map.mode === 'testing') return map;
  return {
    ...map,
    cells: (map.cells || []).map((cell) => (
      cell?.kind === 'problem' && cell.type === 'testing' ? { kind: 'empty' } : cell
    )),
  };
}

function contestPayload(contest, map, problems, user) {
  map = playableContestMap(map, contest);
  const admin = isAdmin(user);
  const testing = isTestingContest(contest);
  const team = teamForUser(contest, user?.username);
  const resolvedIds = cleanResolvedTeams(contest?.resolvedTeams);
  const mineResolved = Boolean(team && resolvedIds.includes(team.id));
  const resolved = testing ? (admin ? contest?.spawnResolved === true : mineResolved) : contest?.spawnResolved === true;
  const choices = cleanTeamCells(contest?.spawnChoices);
  const votes = cleanSpawnVotes(contest?.spawnVotes);
  const spawns = cleanTeamCells(contest?.spawns);
  const claims = cleanClaims(contest?.claims);
  const teams = cleanTeams(contest?.teams);
  const own = (item) => !testing || admin || (team && item.teamId === team.id);
  const visibleTeams = testing && !admin ? teams.filter((item) => team && item.id === team.id) : teams;
  const visibleClaims = claims.filter(own);
  const ended = Date.now() >= (contestWindow(contest)?.endAt ?? Infinity);
  const frozen = Boolean(map) && (ended || (!testing || !admin) && allProblemsClaimed(map, testing && team ? claims.filter((item) => item.teamId === team.id) : claims));
  const visibleVotes = testing && !admin
    ? votes.filter((vote) => team && vote.teamId === team.id)
    : (admin || resolved ? votes : votes.filter((vote) => team && vote.teamId === team.id));
  return {
    success: true,
    serverNow: Date.now(),
    contest: {
      id: contest.id,
      name: contest.name,
      mapId: contest.mapId,
      mode: testing ? 'testing' : 'competition',
      teams: visibleTeams,
      spawnResolved: resolved,
      resolvedTeams: testing && !admin ? (mineResolved && team ? [team.id] : []) : resolvedIds,
      spawnChoices: (testing && !admin) || !(admin || resolved)
        ? choices.filter((choice) => team && choice.teamId === team.id)
        : choices.filter(own),
      spawnVotes: visibleVotes,
      spawns: (testing && !admin) || !(admin || resolved)
        ? spawns.filter((spawn) => team && spawn.teamId === team.id)
        : spawns.filter(own),
      claims: visibleClaims,
      leaderboard: buildLeaderboard({ ...contest, teams: visibleTeams, claims: visibleClaims }, map, problems || []),
      frozen,
    },
  };
}

function contestWindow(contest) {
  if (!contest || !Number.isInteger(contest.startAt)) return null;
  if (contest.startAt < MIN_START_AT || contest.startAt > MAX_START_AT) return null;
  const duration = contest.durationMinutes;
  const spawn = contest.spawnMinutes;
  const ready = contest.readyMinutes;
  if (![duration, spawn, ready].every((value) => Number.isInteger(value))) return null;
  if (duration < 1 || duration > MAX_CONTEST_MINUTES) return null;
  if (spawn < 0 || ready < 0 || spawn > MAX_CONTEST_MINUTES || ready > MAX_CONTEST_MINUTES) return null;
  if (spawn + ready >= duration) return null;
  const minute = 60 * 1000;
  return {
    startAt: contest.startAt,
    spawnEnd: contest.startAt + spawn * minute,
    liveAt: contest.startAt + (spawn + ready) * minute,
    endAt: contest.startAt + duration * minute,
  };
}

function normalizeContest(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.id !== 'string' || !v.id || v.id.length > 80) return null;
  if (typeof v.name !== 'string') return null;
  const name = v.name.trim();
  if (!name || name.length > MAX_NAME_LEN) return null;
  if (typeof v.mapId !== 'string') return null;
  if (!Array.isArray(v.contestantIds)) return null;
  if (!contestWindow(v)) return null;
  const ids = [];
  for (const raw of v.contestantIds) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || id.length > MAX_CONTESTANT_ID_LEN) continue;
    if (ids.includes(id)) continue;
    ids.push(id);
  }
  return {
    id: v.id,
    name,
    mapId: v.mapId,
    contestantIds: ids,
    startAt: v.startAt,
    durationMinutes: v.durationMinutes,
    spawnMinutes: v.spawnMinutes,
    readyMinutes: v.readyMinutes,
    mode: v.mode === 'testing' ? 'testing' : 'competition',
  };
}

// ═══════════════════════════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════════════════════════

function rejectList(label) {
  return { error: `${label} contains an invalid item` };
}

function collectUnique(raw, normalize, keyOf, label) {
  if (!Array.isArray(raw)) return { error: `${label} must be a list` };
  const items = [];
  const seen = new Set();
  for (const item of raw) {
    const normalized = normalize(item);
    if (!normalized) return rejectList(label);
    const key = keyOf(normalized);
    if (seen.has(key)) return { error: `${label} contains a duplicate` };
    seen.add(key);
    items.push(normalized);
  }
  return { items };
}

class SaveConflictError extends Error {}

async function readRevision(db, name, session) {
  const options = session ? { session } : {};
  const doc = await db.collection('meta').findOne({ _id: name }, options);
  return Number.isInteger(doc?.revision) ? doc.revision : 0;
}

async function bumpRevision(db, name, session) {
  const meta = db.collection('meta');
  const options = session ? { upsert: true, session } : { upsert: true };
  await meta.updateOne(
    { _id: name },
    { $inc: { revision: 1 }, $set: { updatedAt: new Date() } },
    options
  );
  const doc = await meta.findOne({ _id: name }, session ? { session } : {});
  return Number.isInteger(doc?.revision) ? doc.revision : 1;
}

function assertRevision(current, expected) {
  if (Number.isInteger(expected) && expected !== current) {
    throw new SaveConflictError('This data changed in another tab. Reload before saving.');
  }
}

// Upserts the documents the client sent and removes only documents that are no
// longer in the list. A collection revision stops a stale tab from deleting
// work that another tab added after this tab loaded.
async function saveCollection(db, name, docs, idOf, expectedRevision) {
  const col = db.collection(name);
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, name, session);
      assertRevision(current, expectedRevision);
      const keepIds = docs.map(idOf);
      await col.deleteMany({ id: { $nin: keepIds } }, { session });
      if (docs.length > 0) {
        const now = new Date();
        await col.bulkWrite(
          docs.map((doc) => ({
            updateOne: {
              filter: { id: idOf(doc) },
              update: { $set: { ...doc, id: idOf(doc), updatedAt: now } },
              upsert: true,
            },
          })),
          { session, ordered: false }
        );
      }
      revision = await bumpRevision(db, name, session);
    });
  } finally {
    await session.endSession();
  }
  return revision;
}

async function handleBootstrap(req, res, db, user) {
  const [maps, problems, storedContests, metaDocs] = await Promise.all([
    db.collection('maps').find({}).toArray(),
    db.collection('problems').find({}).toArray(),
    db.collection('contests').find({}).toArray(),
    db.collection('meta').find({ _id: { $in: ['maps', 'problems', 'contests'] } }).toArray(),
  ]);
  const revisions = { maps: 0, problems: 0, contests: 0 };
  for (const doc of metaDocs) {
    if (doc && revisions[doc._id] !== undefined && Number.isInteger(doc.revision)) {
      revisions[doc._id] = doc.revision;
    }
  }
  const now = Date.now();
  const admin = isAdmin(user);
  const sourceContests = admin
    ? storedContests
    : storedContests.filter((contest) => teamForUser(contest, user.username));
  const contests = [];
  for (const contest of sourceContests) {
    const map = maps.find((item) => item.id === contest.mapId) || null;
    contests.push(await maybeResolveSpawns(db, contest, map, now));
  }

  const mapIds = admin ? null : new Set(contests.map((contest) => contest.mapId));
  const sourceMaps = admin ? maps : maps.filter((map) => mapIds.has(map.id));
  const neededProblems = admin ? null : new Set();
  if (neededProblems) {
    for (const map of sourceMaps) {
      for (const cell of map.cells || []) {
        if (cell?.kind === 'problem' && PROBLEM_TYPES.includes(cell.type) && Number.isInteger(cell.problemNo)) {
          const contest = contests.find((item) => item.mapId === map.id);
          if (cell.type === 'testing' && map.mode !== 'testing' && !isTestingContest(contest)) continue;
          neededProblems.add(`${cell.type}:${cell.problemNo}`);
        }
      }
    }
  }
  const sourceProblems = admin
    ? problems
    : problems.filter((problem) => neededProblems.has(`${problem.type}:${problem.index}`));

  const cleanMaps = sourceMaps.map(m => ({
    id: m.id,
    name: m.name,
    cols: m.cols,
    rows: m.rows,
    cells: m.cells,
    mode: m.mode === 'testing' ? 'testing' : 'official',
    backdrop: m.backdrop === 'photo' && typeof m.photo === 'string' && m.photo ? 'photo' : 'terrain',
    photo: m.backdrop === 'photo' && typeof m.photo === 'string' ? m.photo : '',
  }));
  const cleanProblems = sourceProblems.map(p => {
    const problem = {
      index: p.index,
      type: p.type,
      prompt: p.prompt,
      difficulty: DIFFICULTIES.includes(p.difficulty) ? p.difficulty : 'normal',
    };
    if (admin) {
      problem.answer = p.answer;
      problem.logic = typeof p.logic === 'string' ? p.logic : '';
    }
    return problem;
  });
  const cleanContests = contests.map(c => {
    const map = cleanMaps.find((item) => item.id === c.mapId) || null;
    const play = contestPayload(c, map, problems, user).contest;
    const teams = play.teams;
    return {
      id: c.id,
      name: c.name,
      mapId: c.mapId,
      contestantIds: teams.flatMap((team) => team.members),
      startAt: Number.isInteger(c.startAt) ? c.startAt : null,
      durationMinutes: Number.isInteger(c.durationMinutes) ? c.durationMinutes : null,
      spawnMinutes: Number.isInteger(c.spawnMinutes) ? c.spawnMinutes : null,
      readyMinutes: Number.isInteger(c.readyMinutes) ? c.readyMinutes : null,
      teams,
      spawnResolved: play.spawnResolved,
      resolvedTeams: play.resolvedTeams,
      mode: play.mode,
      spawnChoices: play.spawnChoices,
      spawnVotes: play.spawnVotes,
      spawns: play.spawns,
      claims: play.claims,
    };
  });

  return res.status(200).json({
    success: true,
    user: { username: user.username, role: user.role, displayName: user.displayName, pfp: user.pfp || '' },
    maps: cleanMaps,
    problems: cleanProblems,
    contests: cleanContests,
    versions: await listVersions(db),
    revisions,
    serverNow: Date.now(),
  });
}

async function handleSaveMaps(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const parsed = collectUnique(body.maps, normalizeMap, (map) => map.id, 'Maps');
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  if (parsed.items.some((map) => map.mode !== 'testing' && map.cells.some((cell) => cell.kind === 'problem' && cell.type === 'testing'))) {
    return res.status(400).json({ success: false, message: 'Testing problems can only be placed on a testing map.' });
  }
  try {
    const revision = await saveCollection(db, 'maps', parsed.items, (map) => map.id, body.revision);
    return res.status(200).json({ success: true, count: parsed.items.length, revision });
  } catch (err) {
    if (err instanceof SaveConflictError) {
      return res.status(409).json({ success: false, message: err.message, conflict: true });
    }
    throw err;
  }
}

async function handleSaveProblems(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const parsed = collectUnique(
    body.problems,
    normalizeProblem,
    (problem) => `${problem.type}:${problem.index}`,
    'Problems'
  );
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  try {
    const revision = await saveCollection(
      db,
      'problems',
      parsed.items,
      (problem) => `${problem.type}:${problem.index}`,
      body.revision
    );
    return res.status(200).json({ success: true, count: parsed.items.length, revision });
  } catch (err) {
    if (err instanceof SaveConflictError) {
      return res.status(409).json({ success: false, message: err.message, conflict: true });
    }
    throw err;
  }
}

async function handleTestProblem(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const logic = typeof body.logic === 'string' ? body.logic : '';
  const expected = typeof body.expected === 'string' ? body.expected : '';
  const given = typeof body.answer === 'string' ? body.answer : '';
  if (logic.length > MAX_PROBLEM_LOGIC) {
    return res.status(400).json({ success: false, message: 'Logic is too long.' });
  }
  if (expected.length > MAX_TEST_TEXT || given.length > MAX_TEST_TEXT) {
    return res.status(400).json({ success: false, message: 'The test answer is too long.' });
  }

  if (!logic.trim()) {
    const hasExpected = Boolean(expected.trim());
    const correct = hasExpected && answersMatch(expected, given);
    return res.status(200).json({
      success: true,
      correct,
      systemError: false,
      score: correct ? 100 : 0,
      comment: hasExpected ? (correct ? 'AC' : 'WA') : 'No expected answer set.',
      error: '',
    });
  }

  const judged = runProblemLogic(logic, expected, given);
  return res.status(200).json({ success: true, ...judged });
}

async function handleSaveContests(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const parsed = collectUnique(body.contests, normalizeContest, (contest) => contest.id, 'Contests');
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

  const col = db.collection('contests');
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'contests', session);
      assertRevision(current, body.revision);
      const existing = await col.find({}, { session }).toArray();
      const previous = new Map(existing.map((contest) => [contest.id, contest]));
      const keepIds = parsed.items.map((contest) => contest.id);
      await col.deleteMany({ id: { $nin: keepIds } }, { session });
      for (const contest of parsed.items) {
        const stored = previous.get(contest.id);
        const sameMap = stored && stored.mapId === contest.mapId;
        const update = {
          name: contest.name,
          mapId: contest.mapId,
          startAt: contest.startAt,
          durationMinutes: contest.durationMinutes,
          spawnMinutes: contest.spawnMinutes,
          readyMinutes: contest.readyMinutes,
          mode: contest.mode === 'testing' ? 'testing' : 'competition',
          updatedAt: new Date(),
        };
        const sameMode = stored && isTestingContest(stored) === (contest.mode === 'testing');
        if (!stored) {
          update.teams = [];
          update.contestantIds = [];
          update.spawnChoices = [];
          update.spawnVotes = [];
          update.spawns = [];
          update.claims = [];
          update.spawnResolved = false;
          update.resolvedTeams = [];
        } else if (!sameMap || !sameMode) {
          update.spawnChoices = [];
          update.spawnVotes = [];
          update.spawns = [];
          update.claims = [];
          update.spawnResolved = false;
          update.resolvedTeams = [];
        }
        await col.updateOne(
          { id: contest.id },
          { $set: update },
          { upsert: true, session }
        );
      }
      revision = await bumpRevision(db, 'contests', session);
    });
  } catch (err) {
    if (err instanceof SaveConflictError) {
      return res.status(409).json({ success: false, message: err.message, conflict: true });
    }
    throw err;
  } finally {
    await session.endSession();
  }

  return res.status(200).json({ success: true, count: parsed.items.length, revision });
}

async function handleJoinContest(req, res, db, user, body) {
  const contestId = String(body.contestId || '').trim();
  const contestantId = String(user.username || '').trim();
  if (!contestId || !contestantId) {
    return res.status(400).json({ success: false, message: 'Missing contestId' });
  }

  const col = db.collection('contests');
  const result = await col.updateOne(
    { id: contestId },
    { $addToSet: { contestantIds: contestantId }, $set: { updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ success: false, message: 'Contest not found' });
  }
  const contest = await col.findOne({ id: contestId });
  const revision = await bumpRevision(db, 'contests');
  return res.status(200).json({ success: true, contestantIds: contest?.contestantIds || [], revision });
}

async function handleRemoveContestant(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const contestId = String(body.contestId || '').trim();
  const contestantId = String(body.contestantId || '').trim();
  if (!contestId || !contestantId) {
    return res.status(400).json({ success: false, message: 'Missing contestant' });
  }

  const col = db.collection('contests');
  const result = await col.updateOne(
    { id: contestId },
    {
      $pull: { contestantIds: contestantId, spawns: { contestantId } },
      $set: { updatedAt: new Date() },
    }
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ success: false, message: 'Contest not found' });
  }
  const contest = await col.findOne({ id: contestId });
  const revision = await bumpRevision(db, 'contests');
  return res.status(200).json({ success: true, contestantIds: contest?.contestantIds || [], revision });
}

async function loadContestMap(db, contest) {
  const map = await db.collection('maps').findOne({ id: contest?.mapId });
  if (!map || !Array.isArray(map.cells)) return null;
  return map;
}

async function maybeResolveSpawns(db, contest, map, now) {
  if (!contest || !map) return contest;
  if (isTestingContest(contest)) return maybeResolveTestingSpawns(db, contest, map, now);
  if (contest.spawnResolved === true) return contest;
  const timing = contestWindow(contest);
  if (!timing || now < timing.startAt) return contest;
  const teams = cleanTeams(contest.teams);
  const choices = cleanTeamCells(contest.spawnChoices).filter((choice) => (
    teams.some((team) => team.id === choice.teamId)
  ));
  const everyoneChose = teams.length > 0 && teams.every((team) => choices.some((choice) => choice.teamId === team.id));
  if (!everyoneChose && now < timing.spawnEnd) return contest;
  if (teams.length === 0) return contest;

  const spawns = resolveSpawns(spawnCellIndexes(map), teams, choices);
  await db.collection('contests').updateOne(
    { id: contest.id, spawnResolved: { $ne: true } },
    { $set: { spawns, spawnResolved: true, updatedAt: new Date() } }
  );
  return db.collection('contests').findOne({ id: contest.id });
}

async function maybeResolveTestingSpawns(db, contest, map, now) {
  const timing = contestWindow(contest);
  if (!timing || now < timing.startAt) return contest;
  const teams = cleanTeams(contest.teams);
  const choices = agreedSpawnChoices(teams, cleanSpawnVotes(contest.spawnVotes));
  const resolved = new Set(cleanResolvedTeams(contest.resolvedTeams));
  const spawns = cleanTeamCells(contest.spawns);
  const spawnCells = spawnCellIndexes(map);
  let changed = false;
  for (const team of teams) {
    if (resolved.has(team.id)) continue;
    const choice = choices.find((item) => item.teamId === team.id);
    if (!choice && now < timing.spawnEnd) continue;
    const assigned = resolveSpawns(spawnCells, [team], choice ? [choice] : []);
    const next = assigned.find((item) => item.teamId === team.id);
    if (next) {
      const existing = spawns.findIndex((item) => item.teamId === team.id);
      if (existing >= 0) spawns.splice(existing, 1);
      spawns.push(next);
    }
    resolved.add(team.id);
    changed = true;
  }
  if (!changed) return contest;
  const allResolved = teams.length > 0 && teams.every((team) => resolved.has(team.id));
  await db.collection('contests').updateOne(
    { id: contest.id },
    { $set: { spawns, resolvedTeams: [...resolved], spawnResolved: allResolved, updatedAt: new Date() } }
  );
  return db.collection('contests').findOne({ id: contest.id });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findStudent(db, raw) {
  const name = String(raw || '').trim();
  if (!name || name.length > MAX_CONTESTANT_ID_LEN) {
    return { error: 'Enter a student username.' };
  }
  const users = db.collection('users');
  const exact = new RegExp(`^${escapeRegExp(name)}$`, 'i');
  let record = await users.findOne({ username: exact });
  if (!record) {
    const named = await users.find({ displayName: exact }).limit(2).toArray();
    if (named.length > 1) return { error: `More than one student is named ${name}. Use the username.` };
    record = named[0] || null;
  }
  if (!record || accountIsProtected(record)) return { error: `No student account named ${name}.` };
  if (record.banned === true) return { error: `${record.username} is suspended.` };
  return { username: String(record.username) };
}

async function handleSaveTeam(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const contestId = cleanId(body.contestId) || String(body.contestId || '').trim();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const rawMembers = Array.isArray(body.members)
    ? body.members
    : [body.memberA, body.memberB].filter((item) => typeof item === 'string' && item.trim());
  if (!contestId || !name || name.length > MAX_NAME_LEN || rawMembers.length < 1 || rawMembers.length > 5) {
    return res.status(400).json({ success: false, message: 'Enter a team name and 1 to 5 students.' });
  }

  const col = db.collection('contests');
  const contest = await col.findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });

  const members = [];
  for (const raw of rawMembers) {
    const student = await findStudent(db, raw);
    if (student.error) return res.status(400).json({ success: false, message: student.error });
    if (members.some((member) => sameName(member, student.username))) {
      return res.status(400).json({ success: false, message: 'A student can only be listed once on a team.' });
    }
    members.push(student.username);
  }

  const teams = cleanTeams(contest.teams);
  const requestedTeamId = cleanId(body.teamId);
  const index = requestedTeamId ? teams.findIndex((team) => team.id === requestedTeamId) : -1;
  if (requestedTeamId && index < 0) {
    return res.status(404).json({ success: false, message: 'Team not found in this contest.' });
  }
  const teamId = requestedTeamId || crypto.randomUUID();

  const duplicateName = teams.find((team) => team.id !== teamId && sameName(team.name, name));
  if (duplicateName) {
    return res.status(400).json({ success: false, message: 'Another team in this contest already has that name.' });
  }
  for (const team of teams) {
    if (team.id === teamId) continue;
    if (team.members.some((member) => members.some((next) => sameName(member, next)))) {
      return res.status(400).json({ success: false, message: 'One of those students is already on a team in this contest.' });
    }
  }

  const map = await loadContestMap(db, contest);
  const spawnCount = spawnCellIndexes(map).length;
  if (!map || spawnCount === 0) {
    return res.status(400).json({ success: false, message: 'This contest map has no spawn points. Add spawn points before creating teams.' });
  }
  if (!isTestingContest(contest) && index < 0 && teams.length >= spawnCount) {
    return res.status(400).json({
      success: false,
      message: `This map has ${spawnCount} spawn point${spawnCount === 1 ? '' : 's'}, which is the most teams the contest can start.`,
    });
  }

  const next = { id: teamId, name, members };
  if (index >= 0) teams[index] = next;
  else teams.push(next);
  const spawnVotes = cleanSpawnVotes(contest.spawnVotes).filter((vote) => {
    const owner = teams.find((team) => team.id === vote.teamId);
    return owner && owner.members.some((member) => sameName(member, vote.username));
  });
  await col.updateOne(
    { id: contestId },
    {
      $set: {
        teams,
        contestantIds: teams.flatMap((team) => team.members),
        spawnVotes,
        spawnChoices: agreedSpawnChoices(teams, spawnVotes),
        updatedAt: new Date(),
      },
    }
  );
  const updated = await col.findOne({ id: contestId });
  const problems = await db.collection('problems').find({}).toArray();
  const revision = await bumpRevision(db, 'contests');
  return res.status(200).json({ ...contestPayload(updated, map, problems, user), revision });
}

async function handleRemoveTeam(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const contestId = String(body.contestId || '').trim();
  const teamId = cleanId(body.teamId);
  if (!contestId || !teamId) return res.status(400).json({ success: false, message: 'Missing team' });
  const col = db.collection('contests');
  const contest = await col.findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });
  const teams = cleanTeams(contest.teams).filter((team) => team.id !== teamId);
  const update = {
    teams,
    contestantIds: teams.flatMap((team) => team.members),
    spawnChoices: cleanTeamCells(contest.spawnChoices).filter((choice) => choice.teamId !== teamId),
    spawnVotes: cleanSpawnVotes(contest.spawnVotes).filter((vote) => vote.teamId !== teamId),
    spawns: cleanTeamCells(contest.spawns).filter((spawn) => spawn.teamId !== teamId),
    claims: cleanClaims(contest.claims).filter((claim) => claim.teamId !== teamId),
    updatedAt: new Date(),
  };
  if (teams.length === 0) update.spawnResolved = false;
  await col.updateOne({ id: contestId }, { $set: update });
  const updated = await col.findOne({ id: contestId });
  const map = await loadContestMap(db, updated);
  const problems = await db.collection('problems').find({}).toArray();
  const revision = await bumpRevision(db, 'contests');
  return res.status(200).json({ ...contestPayload(updated, map, problems, user), revision });
}

async function handleChooseSpawn(req, res, db, user, body) {
  const contestId = String(body.contestId || '').trim();
  const cell = body.cell;
  const username = cleanId(user.username);
  if (!contestId || !username || !Number.isInteger(cell) || cell < 0) {
    return res.status(400).json({ success: false, message: 'Choose a spawn point on the map.' });
  }

  const col = db.collection('contests');
  const contest = await col.findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });
  const team = teamForUser(contest, username);
  if (!team) return res.status(403).json({ success: false, message: 'You are not on a team in this contest.' });
  if (contest.spawnResolved === true) {
    return res.status(400).json({ success: false, message: 'Spawn points are already assigned.', serverNow: Date.now() });
  }

  const timing = contestWindow(contest);
  const now = Date.now();
  if (!timing) return res.status(400).json({ success: false, message: 'This contest has no schedule.', serverNow: now });
  if (now < timing.startAt || now >= timing.spawnEnd) {
    return res.status(400).json({ success: false, message: 'Spawning is not open.', serverNow: now });
  }

  const map = await loadContestMap(db, contest);
  if (!map || cell >= map.cells.length || map.cells[cell]?.kind !== 'spawnpoint') {
    return res.status(400).json({ success: false, message: 'That cell is not a spawn point.', serverNow: now });
  }

  const teams = cleanTeams(contest.teams);
  const spawnVotes = cleanSpawnVotes(contest.spawnVotes).filter((vote) => !(vote.teamId === team.id && sameName(vote.username, username)));
  spawnVotes.push({ teamId: team.id, username, cell });
    await col.updateOne(
    { id: contestId, spawnResolved: { $ne: true } },
    {
      $set: {
        spawnVotes,
        spawnChoices: agreedSpawnChoices(teams, spawnVotes),
        updatedAt: new Date(),
      },
    }
  );
  const stored = await col.findOne({ id: contestId });
  const updated = await maybeResolveSpawns(db, stored, map, Date.now());
  const problems = await db.collection('problems').find({}).toArray();
  return res.status(200).json(contestPayload(updated, map, problems, user));
}

async function handleSolve(req, res, db, user, body) {
  const contestId = String(body.contestId || '').trim();
  const cell = body.cell;
  const username = cleanId(user.username);
  if (!contestId || !username || !Number.isInteger(cell) || cell < 0) {
    return res.status(400).json({ success: false, message: 'Choose a problem cell.' });
  }

  const col = db.collection('contests');
  let contest = await col.findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });
  const team = teamForUser(contest, username);
  if (!team) return res.status(403).json({ success: false, message: 'You are not on a team in this contest.' });

  const map = playableContestMap(await loadContestMap(db, contest), contest);
  const problems = await db.collection('problems').find({}).toArray();
  const now = Date.now();
  contest = await maybeResolveSpawns(db, contest, map, now);
  const timing = contestWindow(contest);
  if (!timing || now < timing.liveAt || now >= timing.endAt) {
    return res.status(400).json({ success: false, message: 'The contest is not running.', serverNow: now });
  }
  const testing = isTestingContest(contest);
  const teamReady = testing
    ? cleanResolvedTeams(contest.resolvedTeams).includes(team.id)
    : contest.spawnResolved === true;
  if (!teamReady) {
    return res.status(400).json({ success: false, message: 'Spawn points are not assigned yet.', serverNow: now });
  }
  if (!map || cell >= map.cells.length || map.cells[cell]?.kind !== 'problem') {
    return res.status(400).json({ success: false, message: 'That cell is not a problem.', serverNow: now });
  }
  const teamClaims = cleanClaims(contest.claims).filter((claim) => !testing || claim.teamId === team.id);
  if (allProblemsClaimed(map, teamClaims)) {
    return res.status(400).json({ success: false, message: 'Every problem is already solved.', serverNow: now });
  }
  if (teamClaims.some((claim) => claim.cell === cell)) {
    return res.status(400).json({
      success: false,
      message: testing ? 'Your team already solved this cell.' : 'Another team already holds this cell.',
      serverNow: now,
    });
  }
  if (!adjacentToTeam(map, contest, team.id, cell)) {
    return res.status(400).json({ success: false, message: 'That cell is not next to your territory.', serverNow: now });
  }

  const mapCell = map.cells[cell];
  const problem = problems.find((item) => item.index === mapCell.problemNo && item.type === mapCell.type);
  const logic = typeof problem?.logic === 'string' ? problem.logic.trim() : '';
if (logic) {
  const judged = runProblemLogic(logic, problem.answer, body.answer);
  if (judged.systemError) {
    return res.status(500).json({
      success: false,
      message: judged.comment || 'The checker could not run.',
      serverNow: now,
    });
  }
  if (!judged.correct) {
    return res.status(400).json({
      success: false,
      message: judged.comment || 'That answer is not right.',
      serverNow: now,
    });
  }
} else if (!problem || !answersMatch(problem.answer, body.answer)) {
    const message = problem && String(problem.answer || '').trim()
      ? 'That answer is not right.'
      : 'This problem has no answer yet.';
    return res.status(400).json({ success: false, message, serverNow: now });
  }

  const claim = { cell, teamId: team.id, solvedBy: username, solvedAt: now };
  const claimFilter = testing
    ? { id: contestId, claims: { $not: { $elemMatch: { cell, teamId: team.id } } } }
    : { id: contestId, 'claims.cell': { $ne: cell } };
  const result = await col.updateOne(
    claimFilter,
    { $push: { claims: claim }, $set: { updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) {
    return res.status(400).json({
      success: false,
      message: testing ? 'Your team already solved this cell.' : 'Another team already holds this cell.',
      serverNow: Date.now(),
    });
  }
  const updated = await col.findOne({ id: contestId });
  return res.status(200).json(contestPayload(updated, map, problems, user));
}

function cleanUsername(value) {
  const username = String(value || '').trim();
  if (!username || username.length > 64 || !/^[A-Za-z0-9._-]+$/.test(username)) return '';
  return username;
}

function accountIsProtected(record) {
  return record?.role === 'admin' || record?.role === 'root';
}

function timestampValue(value) {
  if (value instanceof Date) return value.getTime();
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? time : null;
}

function publicAccount(record, memberships = []) {
  return {
    username: String(record.username || ''),
    displayName: String(record.displayName || record.username || ''),
    role: accountIsProtected(record) ? 'admin' : 'student',
    banned: record.banned === true,
    pfp: typeof record.pfp === 'string' ? record.pfp : '',
    createdAt: timestampValue(record.createdAt),
    lastLoginAt: timestampValue(record.lastLoginAt),
    teams: memberships,
  };
}

function contestMemberships(contests) {
  const byUsername = new Map();
  for (const contest of contests) {
    for (const team of cleanTeams(contest?.teams)) {
      for (const member of team.members) {
        const key = String(member || '').trim().toLowerCase();
        if (!key) continue;
        if (!byUsername.has(key)) byUsername.set(key, []);
        byUsername.get(key).push({
          contestId: String(contest.id || ''),
          contestName: String(contest.name || ''),
          teamId: team.id,
          teamName: team.name,
        });
      }
    }
  }
  for (const list of byUsername.values()) {
    list.sort((a, b) => a.contestName.localeCompare(b.contestName) || a.teamName.localeCompare(b.teamName));
  }
  return byUsername;
}

async function handleListAccounts(req, res, db, user) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const [records, contests] = await Promise.all([
    db.collection('users').find({}, { projection: { password: 0 } }).toArray(),
    db.collection('contests').find({}).toArray(),
  ]);
  const memberships = contestMemberships(contests);
  const accounts = records
    .filter((record) => typeof record.username === 'string' && record.username)
    .map((record) => publicAccount(record, memberships.get(record.username.toLowerCase()) || []))
    .sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.username.localeCompare(b.username));
  return res.status(200).json({ success: true, accounts });
}

async function handleCreateAccount(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const username = cleanUsername(body.username);
  const password = String(body.password || '');
  const displayName = String(body.displayName || '').trim() || username;
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username can use letters, numbers, dots, dashes, and underscores, up to 64 characters.' });
  }
  if (password.length < 4 || password.length > 256) {
    return res.status(400).json({ success: false, message: 'Password must be 4 to 256 characters.' });
  }
  if (displayName.length > 60) {
    return res.status(400).json({ success: false, message: 'Display name must be 60 characters or fewer.' });
  }
  const users = db.collection('users');
  const existing = await users.findOne({ username });
  if (existing) return res.status(409).json({ success: false, message: 'That username is already used.' });
  const passwordHash = await bcrypt.hash(password, 10);
  await users.insertOne({
    username,
    displayName,
    password: passwordHash,
    role: 'student',
    banned: false,
    pfp: '',
    createdAt: new Date(),
  });
  const created = await users.findOne({ username }, { projection: { password: 0 } });
  return res.status(200).json({ success: true, account: publicAccount(created) });
}

async function removeStudentFromTeams(db, username, mongoSession = null) {
  const col = db.collection('contests');
  const findOptions = mongoSession ? { session: mongoSession } : {};
  const contests = await col.find({}, findOptions).toArray();
  let changed = 0;

  for (const contest of contests) {
    const teams = cleanTeams(contest.teams);
    const nextTeams = [];
    let touched = false;
    for (const team of teams) {
      if (!team.members.some((member) => sameName(member, username))) {
        nextTeams.push(team);
        continue;
      }
      touched = true;
      const remaining = team.members.filter((member) => !sameName(member, username));
      if (remaining.length > 0) nextTeams.push({ ...team, members: remaining });
    }
    if (!touched) continue;

    const teamIds = new Set(nextTeams.map((team) => team.id));
    const spawnVotes = cleanSpawnVotes(contest.spawnVotes).filter((vote) => (
      teamIds.has(vote.teamId)
      && nextTeams.some((team) => team.id === vote.teamId && team.members.some((member) => sameName(member, vote.username)))
    ));
    const update = {
      teams: nextTeams,
      contestantIds: nextTeams.flatMap((team) => team.members),
      spawnVotes,
      spawnChoices: agreedSpawnChoices(nextTeams, spawnVotes),
      spawns: cleanTeamCells(contest.spawns).filter((spawn) => teamIds.has(spawn.teamId)),
      claims: cleanClaims(contest.claims).filter((claim) => teamIds.has(claim.teamId)),
      updatedAt: new Date(),
    };
    if (nextTeams.length === 0) update.spawnResolved = false;
    const writeOptions = mongoSession ? { session: mongoSession } : {};
    await col.updateOne({ id: contest.id }, { $set: update }, writeOptions);
    changed += 1;
  }
  return changed;
}

async function handleUpdateAccount(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const username = cleanUsername(body.username);
  if (!username) return res.status(400).json({ success: false, message: 'Missing account' });
  const users = db.collection('users');
  const record = await users.findOne({ username });
  if (!record) return res.status(404).json({ success: false, message: 'Account not found' });
  if (accountIsProtected(record)) {
    return res.status(400).json({ success: false, message: 'Admin accounts stay as they are.' });
  }
  const update = {};
  if (body.displayName !== undefined) {
    const displayName = String(body.displayName || '').trim() || username;
    if (displayName.length > 60) {
      return res.status(400).json({ success: false, message: 'Display name must be 60 characters or fewer.' });
    }
    update.displayName = displayName;
  }
  if (body.password !== undefined && String(body.password) !== '') {
    const password = String(body.password);
    if (password.length < 4 || password.length > 256) {
      return res.status(400).json({ success: false, message: 'Password must be 4 to 256 characters.' });
    }
    update.password = await bcrypt.hash(password, 10);
  }
  if (body.banned !== undefined) {
    if (typeof body.banned !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Missing account' });
    }
    if (username === user.username && body.banned) {
      return res.status(400).json({ success: false, message: 'You cannot suspend your own account.' });
    }
    update.banned = body.banned;
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ success: false, message: 'Nothing to change.' });
  }
  update.updatedAt = new Date();
  const removeFromTeams = update.banned === true;
  let teamsChanged = 0;
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await users.updateOne({ username }, { $set: update }, { session });
      if (removeFromTeams) teamsChanged = await removeStudentFromTeams(db, username, session);
    });
  } finally {
    await session.endSession();
  }
  const revision = teamsChanged > 0 ? await bumpRevision(db, 'contests') : null;
  const updated = await users.findOne({ username }, { projection: { password: 0 } });
  const contests = await db.collection('contests').find({}).toArray();
  const memberships = contestMemberships(contests).get(username.toLowerCase()) || [];
  return res.status(200).json({
    success: true,
    account: publicAccount(updated, memberships),
    ...(revision === null ? {} : { revision }),
  });
}

async function listVersions(db) {
  const docs = await db.collection('versions').find({}).sort({ createdAt: -1 }).limit(100).toArray();
  return docs.map((doc) => ({
    id: String(doc.id || doc._id || ''),
    version: String(doc.version || '').slice(0, 40),
    message: String(doc.message || '').slice(0, 4000),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.getTime() : Number(doc.createdAt) || 0,
    createdBy: String(doc.createdBy || '').slice(0, 80),
  })).filter((item) => item.version && item.message);
}

async function handleAddVersion(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const version = typeof body.version === 'string' ? body.version.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!version || version.length > 40 || !message || message.length > 4000) {
    return res.status(400).json({ success: false, message: 'Add a version of up to 40 characters and a message.' });
  }
  await db.collection('versions').insertOne({
    id: crypto.randomUUID(),
    version,
    message,
    createdAt: new Date(),
    createdBy: String(user.username || ''),
  });
  return res.status(200).json({ success: true, versions: await listVersions(db) });
}

async function handleDeleteVersion(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id || id.length > 80) return res.status(400).json({ success: false, message: 'Missing version' });
  const query = [{ id }];
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === id) query.push({ _id: new ObjectId(id) });
  const result = await db.collection('versions').deleteOne({ $or: query });
  if (!result.deletedCount) return res.status(404).json({ success: false, message: 'That version was not found.' });
  return res.status(200).json({ success: true, versions: await listVersions(db) });
}

async function handleDeleteAccount(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const username = cleanUsername(body.username);
  if (!username) return res.status(400).json({ success: false, message: 'Missing account' });
  if (username === user.username) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
  }
  const users = db.collection('users');
  const record = await users.findOne({ username });
  if (!record) return res.status(404).json({ success: false, message: 'Account not found' });
  if (accountIsProtected(record)) {
    return res.status(400).json({ success: false, message: 'Admin accounts stay as they are.' });
  }
  let teamsChanged = 0;
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      teamsChanged = await removeStudentFromTeams(db, username, session);
      await users.deleteOne({ username }, { session });
    });
  } finally {
    await session.endSession();
  }
  const revision = teamsChanged > 0 ? await bumpRevision(db, 'contests') : null;
  return res.status(200).json({ success: true, ...(revision === null ? {} : { revision }) });
}

async function handleContestState(req, res, db, user, body) {
  const contestId = String(body.contestId || req.query.contestId || '').trim();
  if (!contestId) return res.status(400).json({ success: false, message: 'Missing contest' });
  const col = db.collection('contests');
  let contest = await col.findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });
  if (!isAdmin(user) && !teamForUser(contest, user.username)) {
    return res.status(403).json({ success: false, message: 'You are not on a team in this contest.' });
  }
  const map = await loadContestMap(db, contest);
  contest = await maybeResolveSpawns(db, contest, map, Date.now());
  const problems = await db.collection('problems').find({}).toArray();
  return res.status(200).json(contestPayload(contest, map, problems, user));
}

// ═══════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════

// ── Public (no auth) actions for the guest testing page ──────────────
// These expose only prompt/type/difficulty and a pass/fail result.
// `answer` and `logic` are never sent to the client.

const PUBLIC_INDEX_MIN = 26000;
const PUBLIC_INDEX_MAX = 26099;

function isPublicProblem(problem) {
  return problem
    && Number.isInteger(problem.index)
    && problem.index >= PUBLIC_INDEX_MIN
    && problem.index <= PUBLIC_INDEX_MAX;
}

async function handlePublicProblems(req, res, db) {
  const problems = await db.collection('problems')
    .find({ index: { $gte: PUBLIC_INDEX_MIN, $lte: PUBLIC_INDEX_MAX } })
    .toArray();
  return res.status(200).json({
    success: true,
    problems: problems.map((p) => ({
      index: p.index,
      type: p.type,
      prompt: typeof p.prompt === 'string' ? p.prompt : '',
      difficulty: DIFFICULTIES.includes(p.difficulty) ? p.difficulty : 'normal',
    })),
  });
}

async function handlePublicCheck(req, res, db, body) {
  const index = body.index;
  const type = typeof body.type === 'string' ? body.type : '';
  const given = typeof body.answer === 'string' ? body.answer : '';
  if (!Number.isInteger(index) || !PROBLEM_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'Missing problem.' });
  }
  const problem = await db.collection('problems').findOne({ index, type });
  if (!problem || !isPublicProblem(problem)) {
    return res.status(404).json({ success: false, message: 'Problem not available.' });
  }
  if (given.length > MAX_TEST_TEXT) {
    return res.status(400).json({ success: false, message: 'Answer is too long.' });
  }
  const logic = typeof problem.logic === 'string' ? problem.logic.trim() : '';
  if (logic) {
    const judged = runProblemLogic(logic, problem.answer, given);
    return res.status(200).json({
      success: true,
      correct: judged.correct,
      systemError: judged.systemError,
      score: judged.score,
      comment: judged.comment,
      error: judged.error,
    });
  }
  const correct = answersMatch(problem.answer, given);
  return res.status(200).json({
    success: true,
    correct,
    systemError: false,
    score: correct ? 100 : 0,
    comment: correct ? 'AC' : 'WA',
    error: '',
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();


  // Public actions must be checked before auth. They never read the
  // Authorization header and never return answer/logic.
  if (req.method === 'GET' && req.query.action === 'public-problems') {
    let db;
    try { db = await connectToDatabase(); }
    catch { return res.status(500).json({ success: false, message: 'Database unavailable' }); }
    try { return await handlePublicProblems(req, res, db); }
    catch { return res.status(500).json({ success: false, message: 'Internal error' }); }
  }
  if (req.method === 'POST' && req.query.action === 'public-check') {
    let db, body;
    try { db = await connectToDatabase(); }
    catch { return res.status(500).json({ success: false, message: 'Database unavailable' }); }
    try { body = await readBody(req); }
    catch (e) { return res.status(400).json({ success: false, message: e.message }); }
    try { return await handlePublicCheck(req, res, db, body); }
    catch { return res.status(500).json({ success: false, message: 'Internal error' }); }
  }


  // Auth
  const user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // DB
  let db;
  try {
    db = await connectToDatabase();
  } catch (err) {
    console.error('[territory] DB connect failed:', err.message);
    return res.status(500).json({ success: false, message: 'Database unavailable' });
  }

  // A suspended or deleted account loses access on its next request, even if
  // it still holds a valid JWT.
  try {
    const account = await db.collection('users').findOne(
      { username: user.username },
      { projection: { banned: 1 } }
    );
    if (!account || account.banned === true) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  } catch (err) {
    console.error('[territory] account check failed:', err.message);
    return res.status(500).json({ success: false, message: 'Internal error' });
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
      case 'test-problem': return await handleTestProblem(req, res, db, user, body);
      case 'save-contests': return await handleSaveContests(req, res, db, user, body);
      case 'join-contest':  return await handleJoinContest(req, res, db, user, body);
      case 'remove-contestant': return await handleRemoveContestant(req, res, db, user, body);
      case 'save-team':     return await handleSaveTeam(req, res, db, user, body);
      case 'remove-team':   return await handleRemoveTeam(req, res, db, user, body);
      case 'choose-spawn':  return await handleChooseSpawn(req, res, db, user, body);
      case 'solve':         return await handleSolve(req, res, db, user, body);
      case 'contest-state': return await handleContestState(req, res, db, user, body);
      case 'list-accounts': return await handleListAccounts(req, res, db, user);
      case 'create-account': return await handleCreateAccount(req, res, db, user, body);
      case 'update-account': return await handleUpdateAccount(req, res, db, user, body);
      case 'delete-account': return await handleDeleteAccount(req, res, db, user, body);
      case 'add-version': return await handleAddVersion(req, res, db, user, body);
      case 'delete-version': return await handleDeleteVersion(req, res, db, user, body);
      default:
        return res.status(400).json({ success: false, message: 'Unknown action' });
    }
  } catch (err) {
    console.error('[territory] action error:', action, err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
}

export const config = { maxDuration: 20 };

