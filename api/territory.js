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
import { cleanEnergyLedger, energyAfterAttempt, energyState, readEnergySettings } from '../shared/energy.js';
import { problemScore } from '../shared/difficulty.js';
import { MAX_PROBLEM_SCORE } from '../shared/constants.js';
import {
  contestMapIds, primaryMapId, placeKey, cleanTeleports, teleportPairAt, teleportOtherEnd,
} from '../shared/contest-board.js';

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
  if (cell.kind === 'empty' || cell.kind === 'obstacle' || cell.kind === 'spawnpoint' || cell.kind === 'teleport') {
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
  const solution = typeof v.solution === 'string' ? v.solution : '';
  if (solution.length > MAX_PROBLEM_TEXT) return null;
  const logic = typeof v.logic === 'string' ? v.logic : '';
  if (logic.length > MAX_PROBLEM_LOGIC) return null;
  const difficulty = DIFFICULTIES.includes(v.difficulty) ? v.difficulty : 'normal';
  let score = DIFFICULTY_SCORE[difficulty];
  if (v.score !== undefined && v.score !== null && v.score !== '') {
    const n = typeof v.score === 'number' ? v.score : Number(v.score);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PROBLEM_SCORE) return null;
    score = n;
  }
  return {
    index: v.index,
    type: v.type,
    prompt: v.prompt,
    answer: v.answer,
    solution,
    logic,
    difficulty,
    score,
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

function cleanTeamCells(value, fallbackMapId = '') {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const teamId = cleanId(item.teamId);
    const mapId = typeof item.mapId === 'string' && item.mapId ? item.mapId : fallbackMapId;
    if (!teamId || !mapId || !Number.isInteger(item.cell) || item.cell < 0) continue;
    const existing = items.findIndex((entry) => entry.teamId === teamId);
    if (existing >= 0) items.splice(existing, 1);
    items.push({ teamId, mapId, cell: item.cell });
  }
  return items;
}

function cleanSpawnVotes(value, fallbackMapId = '') {
  if (!Array.isArray(value)) return [];
  const votes = [];
  for (const vote of value) {
    if (!vote || typeof vote !== 'object') continue;
    const teamId = cleanId(vote.teamId);
    const username = cleanId(vote.username);
    const mapId = typeof vote.mapId === 'string' && vote.mapId ? vote.mapId : fallbackMapId;
    if (!teamId || !username || !mapId || !Number.isInteger(vote.cell) || vote.cell < 0) continue;
    const existing = votes.findIndex((item) => item.teamId === teamId && sameName(item.username, username));
    if (existing >= 0) votes.splice(existing, 1);
    votes.push({ teamId, username, mapId, cell: vote.cell });
  }
  return votes;
}

function agreedSpawnChoices(teams, votes) {
  const choices = [];
  for (const team of teams) {
    const mine = votes.filter((vote) => vote.teamId === team.id && team.members.some((member) => sameName(member, vote.username)));
    if (mine.length !== team.members.length) continue;
    const mapId = mine[0].mapId;
    const cell = mine[0].cell;
    if (!mine.every((vote) => vote.mapId === mapId && vote.cell === cell)) continue;
    choices.push({ teamId: team.id, mapId, cell });
  }
  return choices;
}

function cleanClaims(value, fallbackMapId = '') {
  if (!Array.isArray(value)) return [];
  const claims = [];
  const seen = new Set();
  for (const claim of value) {
    if (!claim || typeof claim !== 'object') continue;
    const teamId = cleanId(claim.teamId);
    const solvedBy = cleanId(claim.solvedBy);
    const mapId = typeof claim.mapId === 'string' && claim.mapId ? claim.mapId : fallbackMapId;
    if (!teamId || !mapId || !Number.isInteger(claim.cell) || claim.cell < 0) continue;
    const key = `${mapId}:${claim.cell}:${teamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({
      mapId,
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

function spawnPlaces(maps) {
  const places = [];
  for (const map of maps || []) {
    for (const cell of spawnCellIndexes(map)) places.push({ mapId: map.id, cell });
  }
  return places;
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

export function resolveSpawns(spawnPlacesList, teams, choices) {
  const roster = cleanTeams(teams);
  const valid = new Map();
  for (const place of spawnPlacesList || []) {
    if (!place || typeof place.mapId !== 'string' || !place.mapId || !Number.isInteger(place.cell) || place.cell < 0) continue;
    valid.set(placeKey(place.mapId, place.cell), place);
  }
  const byPlace = new Map();
  for (const choice of choices || []) {
    if (!choice || !roster.some((team) => team.id === choice.teamId)) continue;
    const key = placeKey(choice.mapId, choice.cell);
    if (!valid.has(key)) continue;
    for (const ids of byPlace.values()) {
      const index = ids.indexOf(choice.teamId);
      if (index >= 0) ids.splice(index, 1);
    }
    const list = byPlace.get(key) || [];
    list.push(choice.teamId);
    byPlace.set(key, list);
  }

  const assigned = new Map();
  const displaced = [];
  for (const [key, ids] of byPlace) {
    if (ids.length === 0) continue;
    const order = shuffleItems(ids);
    assigned.set(order[0], key);
    displaced.push(...order.slice(1));
  }

  const used = new Set(assigned.values());
  const free = shuffleItems([...valid.keys()].filter((key) => !used.has(key)));
  const waiting = shuffleItems([
    ...displaced,
    ...roster.map((team) => team.id).filter((id) => !assigned.has(id) && !displaced.includes(id)),
  ]);
  for (const teamId of waiting) {
    const key = free.shift();
    if (key === undefined) break;
    assigned.set(teamId, key);
  }
  return [...assigned].map(([teamId, key]) => {
    const place = valid.get(key);
    return { teamId, mapId: place.mapId, cell: place.cell };
  });
}

function territoryCells(contest, teamId, mapId) {
  const fallback = primaryMapId(contest);
  const owned = new Set();
  for (const spawn of cleanTeamCells(contest?.spawns, fallback)) {
    if (spawn.teamId === teamId && spawn.mapId === mapId) owned.add(spawn.cell);
  }
  for (const claim of cleanClaims(contest?.claims, fallback)) {
    if (claim.teamId === teamId && claim.mapId === mapId) owned.add(claim.cell);
  }
  return owned;
}

function adjacentToTeam(map, contest, teamId, cell) {
  const cols = map.cols;
  const row = Math.floor(cell / cols);
  const column = cell % cols;
  const owned = territoryCells(contest, teamId, map.id);
  const neighbors = [];
  if (column > 0) neighbors.push(cell - 1);
  if (column + 1 < cols) neighbors.push(cell + 1);
  if (row > 0) neighbors.push(cell - cols);
  if (row + 1 < map.rows) neighbors.push(cell + cols);
  return neighbors.some((index) => owned.has(index));
}

function allProblemsClaimed(maps, claims, fallbackMapId) {
  const list = (Array.isArray(maps) ? maps : [maps]).filter(Boolean);
  if (!list.length) return false;
  const cleaned = cleanClaims(claims, fallbackMapId);
  let problems = 0;
  for (const map of list) {
    for (const index of problemCellIndexes(map)) {
      problems += 1;
      if (!cleaned.some((claim) => claim.mapId === map.id && claim.cell === index)) return false;
    }
  }
  return problems > 0;
}

function problemDifficulty(problem) {
  return DIFFICULTIES.includes(problem?.difficulty) ? problem.difficulty : 'normal';
}

export function answersMatch(expected, given) {
  if (typeof expected !== 'string' || !expected.trim()) return false;
  return expected.trim().toLowerCase() === String(given ?? '').trim().toLowerCase();
}

function buildLeaderboard(contest, maps, problems) {
  const fallback = primaryMapId(contest);
  const claims = cleanClaims(contest?.claims, fallback);
  const spawns = cleanTeamCells(contest?.spawns, fallback);
  const list = (Array.isArray(maps) ? maps : [maps]).filter(Boolean);
  const mapById = new Map(list.map((map) => [map.id, map]));
  return cleanTeams(contest?.teams).map((team) => {
    let score = 0;
    let solved = 0;
    let territory = spawns.some((spawn) => spawn.teamId === team.id) ? 1 : 0;
    for (const claim of claims) {
      if (claim.teamId !== team.id) continue;
      territory += 1;
      const cell = mapById.get(claim.mapId)?.cells?.[claim.cell];
      if (!cell || cell.kind !== 'problem') continue;
      const problem = (problems || []).find((item) => item.index === cell.problemNo && item.type === cell.type);
      score += problemScore(problem);
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

function contestMapsOf(mapOrMaps, contest) {
  const list = (Array.isArray(mapOrMaps) ? mapOrMaps : [mapOrMaps]).filter(Boolean);
  return list.map((map) => playableContestMap(map, contest)).filter(Boolean);
}

function contestPayload(contest, mapOrMaps, problems, user) {
  const maps = contestMapsOf(mapOrMaps, contest);
  const fallback = primaryMapId(contest);
  const admin = isAdmin(user);
  const testing = isTestingContest(contest);
  const team = teamForUser(contest, user?.username);
  const resolvedIds = cleanResolvedTeams(contest?.resolvedTeams);
  const mineResolved = Boolean(team && resolvedIds.includes(team.id));
  const resolved = testing ? (admin ? contest?.spawnResolved === true : mineResolved) : contest?.spawnResolved === true;
  const choices = cleanTeamCells(contest?.spawnChoices, fallback);
  const votes = cleanSpawnVotes(contest?.spawnVotes, fallback);
  const spawns = cleanTeamCells(contest?.spawns, fallback);
  const claims = cleanClaims(contest?.claims, fallback);
  const teams = cleanTeams(contest?.teams);
  const own = (item) => !testing || admin || (team && item.teamId === team.id);
  const visibleTeams = testing && !admin ? teams.filter((item) => team && item.id === team.id) : teams;
  const visibleClaims = claims.filter(own);
  const ended = Date.now() >= (contestWindow(contest)?.endAt ?? Infinity);
  const frozenClaims = testing && team ? claims.filter((item) => item.teamId === team.id) : claims;
  const frozen = maps.length > 0 && (ended || (!testing || !admin) && allProblemsClaimed(maps, frozenClaims, fallback));
  const visibleVotes = testing && !admin
    ? votes.filter((vote) => team && vote.teamId === team.id)
    : (admin || resolved ? votes : votes.filter((vote) => team && vote.teamId === team.id));
  return {
    success: true,
    serverNow: Date.now(),
    contest: {
      id: contest.id,
      name: contest.name,
      mapId: fallback,
      mapIds: contestMapIds(contest),
      teleports: cleanTeleports(contest.teleports, contestMapIds(contest)),
      mode: testing ? 'testing' : 'competition',
      spawnMode: isRandomSpawn(contest) ? 'random' : 'choose',
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
      leaderboard: buildLeaderboard({ ...contest, teams: visibleTeams, claims: visibleClaims }, maps, problems || []),
      frozen,
      ...energyFields(contest, admin ? null : team?.id, Date.now()),
    },
  };
}

function energyFields(contest, onlyTeamId, now) {
  const settings = readEnergySettings(contest);
  const ledger = cleanEnergyLedger(contest?.energy).filter((entry) => !onlyTeamId || entry.teamId === onlyTeamId);
  return {
    energyRegen: settings.regen,
    energyRegenSeconds: settings.regenSeconds,
    energyAttemptCost: settings.attemptCost,
    energyAttemptMin: settings.attemptMin,
    energySolveBelow: settings.solveBelow,
    energySolve: settings.solve,
    energy: ledger,
  };
}

function teamEnergySnapshot(contest, teamId, now) {
  const timing = contestWindow(contest);
  const stored = cleanEnergyLedger(contest?.energy).find((entry) => entry.teamId === teamId) || null;
  return energyState({
    settings: readEnergySettings(contest),
    liveAt: timing?.liveAt,
    endAt: timing?.endAt,
    now,
    stored,
  });
}

function energyWriteFilter(contestId, teamId, previous) {
  if (previous) {
    return {
      id: contestId,
      energy: { $elemMatch: { teamId, value: previous.value, at: previous.at } },
    };
  }
  return {
    id: contestId,
    energy: { $not: { $elemMatch: { teamId } } },
  };
}

async function saveTeamEnergy(col, contest, teamId, now, difficulty, correct, force = false) {
  const settings = readEnergySettings(contest);
  const snapshot = teamEnergySnapshot(contest, teamId, now);
  if (snapshot.value < settings.attemptMin) {
    return { blocked: true, current: snapshot.value, settings, contest };
  }
  const next = energyAfterAttempt(snapshot.value, settings, difficulty, correct);
  const previous = cleanEnergyLedger(contest?.energy).find((entry) => entry.teamId === teamId) || null;
  const entry = { teamId, value: next, at: snapshot.at };
  const result = await col.updateOne(
    force ? { id: contest.id } : energyWriteFilter(contest.id, teamId, previous),
    [{
      $set: {
        energy: {
          $concatArrays: [
            {
              $filter: {
                input: { $ifNull: ['$energy', []] },
                as: 'entry',
                cond: { $ne: ['$$entry.teamId', teamId] },
              },
            },
            [entry],
          ],
        },
        updatedAt: '$$NOW',
      },
    }]
  );
  if (result.matchedCount !== 1) return { retry: true };
  const updated = await col.findOne({ id: contest.id });
  return { blocked: false, current: snapshot.value, next, settings, contest: updated };
}

async function spendTeamEnergy(col, contestId, teamId, now, difficulty, correct) {
  let contest = await col.findOne({ id: contestId });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!contest) return { missing: true };
    const saved = await saveTeamEnergy(col, contest, teamId, now, difficulty, correct, attempt === 4);
    if (!saved.retry) return saved;
    contest = await col.findOne({ id: contestId });
  }
  return { conflict: true, contest };
}

function isRandomSpawn(contest) {
  return contest?.spawnMode === 'random';
}

function contestStoredUpdate(contest, stored) {
  const sameMap = stored && contestMapIds(stored).slice().sort().join('\0') === contest.mapIds.slice().sort().join('\0');
  const update = {
    name: contest.name,
    mapId: contest.mapId,
    mapIds: contest.mapIds,
    teleports: contest.teleports,
    startAt: contest.startAt,
    durationMinutes: contest.durationMinutes,
    spawnMinutes: contest.spawnMinutes,
    readyMinutes: contest.readyMinutes,
    mode: contest.mode === 'testing' ? 'testing' : 'competition',
    spawnMode: contest.spawnMode === 'random' ? 'random' : 'choose',
    energyRegen: contest.energyRegen,
    energyRegenSeconds: contest.energyRegenSeconds,
    energyAttemptCost: contest.energyAttemptCost,
    energyAttemptMin: contest.energyAttemptMin,
    energySolveBelow: contest.energySolveBelow,
    energySolve: contest.energySolve,
    updatedAt: new Date(),
  };
  const sameMode = stored && isTestingContest(stored) === (contest.mode === 'testing');
  const sameSpawnMode = stored && isRandomSpawn(stored) === (contest.spawnMode === 'random');
  if (!stored) {
    update.teams = [];
    update.contestantIds = [];
    update.spawnChoices = [];
    update.spawnVotes = [];
    update.spawns = [];
    update.claims = [];
    update.spawnResolved = false;
    update.resolvedTeams = [];
    update.energy = [];
  } else if (!sameMap || !sameMode || !sameSpawnMode) {
    update.spawnChoices = [];
    update.spawnVotes = [];
    update.spawns = [];
    update.claims = [];
    update.spawnResolved = false;
    update.resolvedTeams = [];
    update.energy = [];
  }
  return update;
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
  const mapIds = contestMapIds(v);
  if (!mapIds.length) return null;
  if (!Array.isArray(v.contestantIds)) return null;
  const spawnMode = v.spawnMode === 'random' ? 'random' : 'choose';
  const spawnMinutes = spawnMode === 'random' ? 0 : v.spawnMinutes;
  if (!contestWindow({ ...v, spawnMinutes })) return null;
  const ids = [];
  for (const raw of v.contestantIds) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || id.length > MAX_CONTESTANT_ID_LEN) continue;
    if (ids.includes(id)) continue;
    ids.push(id);
  }
  const energy = readEnergySettings(v);
  return {
    id: v.id,
    name,
    mapId: mapIds[0],
    mapIds,
    teleports: cleanTeleports(v.teleports, mapIds),
    contestantIds: ids,
    startAt: v.startAt,
    durationMinutes: v.durationMinutes,
    spawnMinutes,
    readyMinutes: v.readyMinutes,
    mode: v.mode === 'testing' ? 'testing' : 'competition',
    spawnMode,
    energyRegen: energy.regen,
    energyRegenSeconds: energy.regenSeconds,
    energyAttemptCost: energy.attemptCost,
    energyAttemptMin: energy.attemptMin,
    energySolveBelow: energy.solveBelow,
    energySolve: energy.solve,
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
    const contestMaps = contestMapIds(contest).map((id) => maps.find((item) => item.id === id)).filter(Boolean);
    contests.push(await maybeResolveSpawns(db, contest, contestMaps, now));
  }

  const mapIds = admin ? null : new Set(contests.flatMap((contest) => contestMapIds(contest)));
  const sourceMaps = admin ? maps : maps.filter((map) => mapIds.has(map.id));
  const neededProblems = admin ? null : new Set();
  if (neededProblems) {
    for (const map of sourceMaps) {
      for (const cell of map.cells || []) {
        if (cell?.kind === 'problem' && PROBLEM_TYPES.includes(cell.type) && Number.isInteger(cell.problemNo)) {
          const contest = contests.find((item) => contestMapIds(item).includes(map.id));
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
      score: problemScore(p),
    };
    if (admin) {
      problem.answer = p.answer;
      problem.solution = typeof p.solution === 'string' ? p.solution : '';
      problem.logic = typeof p.logic === 'string' ? p.logic : '';
    }
    return problem;
  });
  const cleanContests = contests.map(c => {
    const contestMaps = contestMapIds(c).map((id) => cleanMaps.find((item) => item.id === id)).filter(Boolean);
    const play = contestPayload(c, contestMaps, problems, user).contest;
    const teams = play.teams;
    return {
      id: c.id,
      name: c.name,
      mapId: play.mapId,
      mapIds: play.mapIds,
      teleports: play.teleports,
      contestantIds: teams.flatMap((team) => team.members),
      startAt: Number.isInteger(c.startAt) ? c.startAt : null,
      durationMinutes: Number.isInteger(c.durationMinutes) ? c.durationMinutes : null,
      spawnMinutes: Number.isInteger(c.spawnMinutes) ? c.spawnMinutes : null,
      readyMinutes: Number.isInteger(c.readyMinutes) ? c.readyMinutes : null,
      spawnMode: c.spawnMode === 'random' ? 'random' : 'choose',
      energyRegen: play.energyRegen,
      energyRegenSeconds: play.energyRegenSeconds,
      energyAttemptCost: play.energyAttemptCost,
      energyAttemptMin: play.energyAttemptMin,
      energySolveBelow: play.energySolveBelow,
      energySolve: play.energySolve,
      energy: play.energy,
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
        await col.updateOne(
          { id: contest.id },
          { $set: contestStoredUpdate(contest, stored) },
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

async function loadContestMaps(db, contest, { photo = true } = {}) {
  const ids = contestMapIds(contest);
  if (!ids.length) return [];
  const options = photo ? {} : { projection: { photo: 0 } };
  const found = await db.collection('maps').find({ id: { $in: ids } }, options).toArray();
  const byId = new Map(found.map((map) => [map.id, map]));
  return ids.map((id) => byId.get(id)).filter((map) => map && Array.isArray(map.cells));
}

async function assignRandomSpawns(db, contest, maps, teams) {
  const spawns = resolveSpawns(spawnPlaces(maps), teams, []);
  await db.collection('contests').updateOne(
    { id: contest.id, spawnResolved: { $ne: true } },
    {
      $set: {
        spawns,
        spawnChoices: [],
        spawnVotes: [],
        resolvedTeams: teams.map((team) => team.id),
        spawnResolved: true,
        updatedAt: new Date(),
      },
    }
  );
  return db.collection('contests').findOne({ id: contest.id });
}

async function maybeResolveSpawns(db, contest, mapOrMaps, now) {
  const maps = (Array.isArray(mapOrMaps) ? mapOrMaps : [mapOrMaps]).filter(Boolean);
  if (!contest || !maps.length) return contest;
  if (isTestingContest(contest)) return maybeResolveTestingSpawns(db, contest, maps, now);
  if (contest.spawnResolved === true) return contest;
  const timing = contestWindow(contest);
  if (!timing || now < timing.startAt) return contest;
  const teams = cleanTeams(contest.teams);
  if (isRandomSpawn(contest)) {
    if (teams.length === 0) return contest;
    return assignRandomSpawns(db, contest, maps, teams);
  }
  const choices = cleanTeamCells(contest.spawnChoices, primaryMapId(contest)).filter((choice) => (
    teams.some((team) => team.id === choice.teamId)
  ));
  const everyoneChose = teams.length > 0 && teams.every((team) => choices.some((choice) => choice.teamId === team.id));
  if (!everyoneChose && now < timing.spawnEnd) return contest;
  if (teams.length === 0) return contest;

  const spawns = resolveSpawns(spawnPlaces(maps), teams, choices);
  await db.collection('contests').updateOne(
    { id: contest.id, spawnResolved: { $ne: true } },
    { $set: { spawns, spawnResolved: true, updatedAt: new Date() } }
  );
  return db.collection('contests').findOne({ id: contest.id });
}

async function maybeResolveTestingSpawns(db, contest, maps, now) {
  const timing = contestWindow(contest);
  if (!timing || now < timing.startAt) return contest;
  const teams = cleanTeams(contest.teams);
  if (isRandomSpawn(contest)) {
    if (contest.spawnResolved === true || teams.length === 0) return contest;
    return assignRandomSpawns(db, contest, maps, teams);
  }
  const choices = agreedSpawnChoices(teams, cleanSpawnVotes(contest.spawnVotes, primaryMapId(contest)));
  const resolved = new Set(cleanResolvedTeams(contest.resolvedTeams));
  const spawns = cleanTeamCells(contest.spawns, primaryMapId(contest));
  const places = spawnPlaces(maps);
  let changed = false;
  for (const team of teams) {
    if (resolved.has(team.id)) continue;
    const choice = choices.find((item) => item.teamId === team.id);
    if (!choice && now < timing.spawnEnd) continue;
    const assigned = resolveSpawns(places, [team], choice ? [choice] : []);
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

  const maps = await loadContestMaps(db, contest);
  const spawnCount = spawnPlaces(maps).length;
  if (!maps.length || spawnCount === 0) {
    return res.status(400).json({ success: false, message: 'This contest has no spawn points. Add spawn points before creating teams.' });
  }
  if (!isTestingContest(contest) && index < 0 && teams.length >= spawnCount) {
    return res.status(400).json({
      success: false,
      message: `These maps have ${spawnCount} spawn point${spawnCount === 1 ? '' : 's'}, which is the most teams the contest can start.`,
    });
  }

  const next = { id: teamId, name, members };
  if (index >= 0) teams[index] = next;
  else teams.push(next);
  const spawnVotes = cleanSpawnVotes(contest.spawnVotes, primaryMapId(contest)).filter((vote) => {
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
  return res.status(200).json({ ...contestPayload(updated, maps, problems, user), revision });
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
    spawnChoices: cleanTeamCells(contest.spawnChoices, primaryMapId(contest)).filter((choice) => choice.teamId !== teamId),
    spawnVotes: cleanSpawnVotes(contest.spawnVotes, primaryMapId(contest)).filter((vote) => vote.teamId !== teamId),
    spawns: cleanTeamCells(contest.spawns, primaryMapId(contest)).filter((spawn) => spawn.teamId !== teamId),
    claims: cleanClaims(contest.claims, primaryMapId(contest)).filter((claim) => claim.teamId !== teamId),
    energy: cleanEnergyLedger(contest.energy).filter((entry) => entry.teamId !== teamId),
    updatedAt: new Date(),
  };
  if (teams.length === 0) update.spawnResolved = false;
  await col.updateOne({ id: contestId }, { $set: update });
  const updated = await col.findOne({ id: contestId });
  const maps = await loadContestMaps(db, updated);
  const problems = await db.collection('problems').find({}).toArray();
  const revision = await bumpRevision(db, 'contests');
  return res.status(200).json({ ...contestPayload(updated, maps, problems, user), revision });
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
  if (isRandomSpawn(contest)) {
    return res.status(400).json({ success: false, message: 'Spawn points in this contest are assigned at random.', serverNow: Date.now() });
  }
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

  const maps = await loadContestMaps(db, contest);
  const mapId = typeof body.mapId === 'string' && contestMapIds(contest).includes(body.mapId) ? body.mapId : primaryMapId(contest);
  const map = maps.find((item) => item.id === mapId) || null;
  if (!map || cell >= map.cells.length || map.cells[cell]?.kind !== 'spawnpoint') {
    return res.status(400).json({ success: false, message: 'That cell is not a spawn point.', serverNow: now });
  }

  const teams = cleanTeams(contest.teams);
  const spawnVotes = cleanSpawnVotes(contest.spawnVotes, primaryMapId(contest)).filter((vote) => !(vote.teamId === team.id && sameName(vote.username, username)));
  spawnVotes.push({ teamId: team.id, username, mapId: map.id, cell });
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
  const updated = await maybeResolveSpawns(db, stored, maps, Date.now());
  const problems = await db.collection('problems').find({}).toArray();
  return res.status(200).json(contestPayload(updated, maps, problems, user));
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

  const maps = (await loadContestMaps(db, contest)).map((item) => playableContestMap(item, contest));
  const mapId = typeof body.mapId === 'string' && contestMapIds(contest).includes(body.mapId) ? body.mapId : primaryMapId(contest);
  const map = maps.find((item) => item.id === mapId) || null;
  const problems = await db.collection('problems').find({}).toArray();
  const now = Date.now();
  contest = await maybeResolveSpawns(db, contest, maps, now);
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
  const teamClaims = cleanClaims(contest.claims, primaryMapId(contest)).filter((claim) => !testing || claim.teamId === team.id);
  if (allProblemsClaimed(maps, teamClaims, primaryMapId(contest))) {
    return res.status(400).json({ success: false, message: 'Every problem is already solved.', serverNow: now });
  }
  if (teamClaims.some((claim) => claim.mapId === map.id && claim.cell === cell)) {
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
  const difficulty = problemDifficulty(problem);
  const settings = readEnergySettings(contest);
  const preview = teamEnergySnapshot(contest, team.id, now);
  if (preview.value < settings.attemptMin) {
    return res.status(400).json({
      success: false,
      message: `The team has ${preview.value} energy. An attempt needs at least ${settings.attemptMin}.`,
      serverNow: now,
      contest: contestPayload(contest, maps, problems, user).contest,
    });
  }

  const logic = typeof problem?.logic === 'string' ? problem.logic.trim() : '';
  let correct = false;
  let wrongMessage = '';
  if (logic) {
    const judged = runProblemLogic(logic, problem.answer, body.answer);
    if (judged.systemError) {
      return res.status(500).json({
        success: false,
        message: judged.comment || 'The checker could not run.',
        serverNow: now,
      });
    }
    correct = judged.correct === true;
    if (!correct) wrongMessage = judged.comment || 'That answer is not right.';
  } else if (!problem || !answersMatch(problem.answer, body.answer)) {
    wrongMessage = problem && String(problem.answer || '').trim()
      ? 'That answer is not right.'
      : 'This problem has no answer yet.';
  } else {
    correct = true;
  }

  const spent = await spendTeamEnergy(col, contestId, team.id, now, difficulty, correct);
  if (spent.missing) return res.status(404).json({ success: false, message: 'Contest not found', serverNow: now });
  if (spent.blocked || spent.conflict || !spent.contest) {
    const message = spent.blocked
      ? `The team has ${spent.current} energy. An attempt needs at least ${spent.settings.attemptMin}.`
      : 'Energy changed while that answer was checked. Try again.';
    return res.status(400).json({
      success: false,
      message,
      serverNow: now,
      ...(spent.contest ? { contest: contestPayload(spent.contest, maps, problems, user).contest } : {}),
    });
  }
  if (!correct) {
    return res.status(400).json({
      success: false,
      message: wrongMessage,
      serverNow: now,
      contest: contestPayload(spent.contest, maps, problems, user).contest,
    });
  }

  const claim = { mapId: map.id, cell, teamId: team.id, solvedBy: username, solvedAt: now };
  const held = heldClaimQuery(map.id, cell, primaryMapId(contest), testing ? team.id : '');
  const claimFilter = { id: contestId, claims: { $not: { $elemMatch: held } } };
  const result = await col.updateOne(claimFilter, { $push: { claims: claim }, $set: { updatedAt: new Date() } });
  const updated = await col.findOne({ id: contestId });
  if (result.matchedCount === 0) {
    return res.status(400).json({
      success: false,
      message: testing ? 'Your team already solved this cell.' : 'Another team already holds this cell.',
      serverNow: Date.now(),
      contest: contestPayload(updated, maps, problems, user).contest,
    });
  }
  return res.status(200).json(contestPayload(updated, maps, problems, user));
}

function heldClaimQuery(mapId, cell, primary, teamId) {
  const places = [{ mapId, cell }];
  if (mapId === primary) places.push({ cell, mapId: { $exists: false } });
  if (teamId) return { $or: places.map((place) => ({ ...place, teamId })) };
  return { $or: places };
}

async function handleClaimTeleport(req, res, db, user, body) {
  const contestId = String(body.contestId || '').trim();
  const cell = body.cell;
  const username = cleanId(user.username);
  if (!contestId || !username || !Number.isInteger(cell) || cell < 0) {
    return res.status(400).json({ success: false, message: 'Choose a teleport cell.' });
  }
  const col = db.collection('contests');
  let contest = await col.findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found' });
  const team = teamForUser(contest, username);
  if (!team) return res.status(403).json({ success: false, message: 'You are not on a team in this contest.' });

  const maps = (await loadContestMaps(db, contest)).map((item) => playableContestMap(item, contest));
  const mapId = typeof body.mapId === 'string' && contestMapIds(contest).includes(body.mapId) ? body.mapId : primaryMapId(contest);
  const map = maps.find((item) => item.id === mapId) || null;
  const problems = await db.collection('problems').find({}).toArray();
  const now = Date.now();
  contest = await maybeResolveSpawns(db, contest, maps, now);
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
  if (!map || cell >= map.cells.length || map.cells[cell]?.kind !== 'teleport') {
    return res.status(400).json({ success: false, message: 'That cell is not a teleport.', serverNow: now });
  }
  const pair = teleportPairAt({ ...contest, teleports: cleanTeleports(contest.teleports, contestMapIds(contest)) }, map.id, cell);
  const other = teleportOtherEnd(pair, map.id, cell);
  if (!pair || !other) {
    return res.status(400).json({ success: false, message: 'This teleport is not connected.', serverNow: now });
  }
  const otherMap = maps.find((item) => item.id === other.mapId) || null;
  if (!otherMap || other.cell >= otherMap.cells.length || otherMap.cells[other.cell]?.kind !== 'teleport') {
    return res.status(400).json({ success: false, message: 'The other end of this teleport is not on a contest map.', serverNow: now });
  }
  if (!adjacentToTeam(map, contest, team.id, cell)) {
    return res.status(400).json({ success: false, message: 'That teleport is not next to your territory.', serverNow: now });
  }
  const claims = cleanClaims(contest.claims, primaryMapId(contest));
  const blocks = (place) => claims.some((claim) => (
    claim.mapId === place.mapId && claim.cell === place.cell && (!testing || claim.teamId === team.id)
  ));
  if (blocks({ mapId: map.id, cell }) || blocks(other)) {
    return res.status(400).json({
      success: false,
      message: testing ? 'Your team already holds this teleport.' : 'Another team already holds this teleport.',
      serverNow: now,
    });
  }

  const ends = [{ mapId: map.id, cell }, other];
  const fresh = [];
  for (const end of ends) {
    fresh.push({ mapId: end.mapId, cell: end.cell, teamId: team.id, solvedBy: username, solvedAt: now });
  }
  const filters = ends.map((end) => heldClaimQuery(end.mapId, end.cell, primaryMapId(contest), testing ? team.id : ''));
  const result = await col.updateOne(
    { id: contestId, $and: filters.map((filter) => ({ claims: { $not: { $elemMatch: filter } } })) },
    { $push: { claims: { $each: fresh } }, $set: { updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) {
    return res.status(400).json({
      success: false,
      message: testing ? 'Your team already holds this teleport.' : 'Another team already holds this teleport.',
      serverNow: Date.now(),
    });
  }
  const updated = await col.findOne({ id: contestId });
  return res.status(200).json(contestPayload(updated, maps, problems, user));
}

function cleanUsername(value) {
  const username = String(value || '').trim();
  if (!username || username.length > 64 || !/^[A-Za-z0-9._-]+$/.test(username)) return '';
  return username;
}

function accountRole(record) {
  if (record?.role === 'root') return 'root';
  if (record?.role === 'admin') return 'admin';
  return 'student';
}

function isRootAccount(record) {
  return accountRole(record) === 'root';
}

function isReservedRoot(record) {
  return isRootAccount(record) || String(record?.username || '').toLowerCase() === 'root';
}

async function actingAccount(db, user) {
  const record = await db.collection('users').findOne({ username: user.username });
  if (!record || record.banned === true) return null;
  return record;
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
    role: accountRole(record),
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
    .sort((a, b) => (a.role === 'root' ? 0 : a.role === 'admin' ? 1 : 2) - (b.role === 'root' ? 0 : b.role === 'admin' ? 1 : 2) || a.username.localeCompare(b.username));
  return res.status(200).json({ success: true, accounts });
}

async function handleCreateAccount(req, res, db, user, body) {
  const actor = await actingAccount(db, user);
  if (!actor) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!isAdmin(actor)) return res.status(403).json({ success: false, message: 'Admin only' });
  const username = cleanUsername(body.username);
  const password = String(body.password || '');
  const displayName = String(body.displayName || '').trim() || username;
  const role = body.role === 'admin' ? 'admin' : 'student';
  if (body.role !== undefined && body.role !== 'admin' && body.role !== 'student') {
    return res.status(400).json({ success: false, message: 'Choose a student or an admin account.' });
  }
  if (role === 'admin' && !isRootAccount(actor)) {
    return res.status(403).json({ success: false, message: 'Only the root account can create an admin.' });
  }
  if (username.toLowerCase() === 'root') {
    return res.status(400).json({ success: false, message: 'That username is reserved.' });
  }
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
    role,
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
    const spawnVotes = cleanSpawnVotes(contest.spawnVotes, primaryMapId(contest)).filter((vote) => (
      teamIds.has(vote.teamId)
      && nextTeams.some((team) => team.id === vote.teamId && team.members.some((member) => sameName(member, vote.username)))
    ));
    const update = {
      teams: nextTeams,
      contestantIds: nextTeams.flatMap((team) => team.members),
      spawnVotes,
      spawnChoices: agreedSpawnChoices(nextTeams, spawnVotes),
      spawns: cleanTeamCells(contest.spawns, primaryMapId(contest)).filter((spawn) => teamIds.has(spawn.teamId)),
      claims: cleanClaims(contest.claims, primaryMapId(contest)).filter((claim) => teamIds.has(claim.teamId)),
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
  const actor = await actingAccount(db, user);
  if (!actor) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!isAdmin(actor)) return res.status(403).json({ success: false, message: 'Admin only' });
  const username = cleanUsername(body.username);
  if (!username) return res.status(400).json({ success: false, message: 'Missing account' });
  const users = db.collection('users');
  const record = await users.findOne({ username });
  if (!record) return res.status(404).json({ success: false, message: 'Account not found' });
  if (isReservedRoot(record)) {
    return res.status(400).json({ success: false, message: 'The root account cannot be changed here.' });
  }
  if (accountRole(record) === 'admin' && !isRootAccount(actor)) {
    return res.status(403).json({ success: false, message: 'Only the root account can change an admin.' });
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
  const actor = await actingAccount(db, user);
  if (!actor) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!isAdmin(actor)) return res.status(403).json({ success: false, message: 'Admin only' });
  const username = cleanUsername(body.username);
  if (!username) return res.status(400).json({ success: false, message: 'Missing account' });
  if (username === user.username) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
  }
  const users = db.collection('users');
  const record = await users.findOne({ username });
  if (!record) return res.status(404).json({ success: false, message: 'Account not found' });
  if (isReservedRoot(record)) {
    return res.status(400).json({ success: false, message: 'The root account cannot be deleted.' });
  }
  if (accountRole(record) === 'admin' && !isRootAccount(actor)) {
    return res.status(403).json({ success: false, message: 'Only the root account can delete an admin.' });
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
  const maps = await loadContestMaps(db, contest, { photo: false });
  contest = await maybeResolveSpawns(db, contest, maps, Date.now());
  const problems = await problemsOnMaps(db, maps, { index: 1, type: 1, difficulty: 1, score: 1 });
  return res.status(200).json(contestPayload(contest, maps, problems, user));
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
      score: problemScore(p),
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

function withSchedule(contest, view) {
  return {
    ...view,
    startAt: Number.isInteger(contest.startAt) ? contest.startAt : null,
    durationMinutes: Number.isInteger(contest.durationMinutes) ? contest.durationMinutes : null,
    spawnMinutes: Number.isInteger(contest.spawnMinutes) ? contest.spawnMinutes : null,
    readyMinutes: Number.isInteger(contest.readyMinutes) ? contest.readyMinutes : null,
  };
}

function pageUser(user) {
  return { username: user.username, role: user.role, displayName: user.displayName, pfp: user.pfp || '' };
}

async function pageRevisions(db) {
  const docs = await db.collection('meta').find({ _id: { $in: ['maps', 'problems', 'contests'] } }).toArray();
  const revisions = { maps: 0, problems: 0, contests: 0 };
  for (const doc of docs) {
    if (doc && revisions[doc._id] !== undefined && Number.isInteger(doc.revision)) revisions[doc._id] = doc.revision;
  }
  return revisions;
}

function pageMap(map, withCells) {
  const cells = Array.isArray(map?.cells) ? map.cells : [];
  const view = {
    id: map.id,
    name: map.name,
    cols: map.cols,
    rows: map.rows,
    mode: map.mode === 'testing' ? 'testing' : 'official',
    spawnPoints: Number.isInteger(map?.spawnPoints)
      ? map.spawnPoints
      : cells.filter((cell) => cell?.kind === 'spawnpoint').length,
  };
  if (!withCells) return view;
  view.cells = cells;
  view.backdrop = map.backdrop === 'photo' && typeof map.photo === 'string' && map.photo ? 'photo' : 'terrain';
  view.photo = view.backdrop === 'photo' ? map.photo : '';
  return view;
}

function pageProblem(problem, admin) {
  const view = {
    index: problem.index,
    type: problem.type,
    prompt: problem.prompt,
    difficulty: DIFFICULTIES.includes(problem.difficulty) ? problem.difficulty : 'normal',
    score: problemScore(problem),
  };
  if (admin) {
    view.answer = problem.answer;
    view.solution = typeof problem.solution === 'string' ? problem.solution : '';
    view.logic = typeof problem.logic === 'string' ? problem.logic : '';
  }
  return view;
}

function problemStub(problem) {
  return {
    index: problem.index,
    type: problem.type,
    difficulty: DIFFICULTIES.includes(problem.difficulty) ? problem.difficulty : 'normal',
    score: problemScore(problem),
  };
}

function problemIdentity(type, index) {
  return `${type}:${index}`;
}

async function mapCellIndex(db, session) {
  const options = session ? { session } : {};
  const maps = await db.collection('maps').aggregate([
    { $project: {
      id: 1,
      cells: {
        $map: {
          input: {
            $filter: {
              input: { $ifNull: ['$cells', []] },
              as: 'cell',
              cond: { $eq: ['$$cell.kind', 'problem'] },
            },
          },
          as: 'cell',
          in: { kind: '$$cell.kind', type: '$$cell.type', problemNo: '$$cell.problemNo' },
        },
      },
    } },
  ], options).toArray();
  const usage = {};
  const reserved = [];
  const seen = new Set();
  for (const map of maps) {
    const onMap = new Set();
    for (const cell of map.cells || []) {
      if (cell?.kind !== 'problem' || !PROBLEM_TYPES.includes(cell.type) || !Number.isInteger(cell.problemNo)) continue;
      const key = problemIdentity(cell.type, cell.problemNo);
      if (!usage[key]) usage[key] = { cells: 0, maps: 0 };
      usage[key].cells += 1;
      if (!onMap.has(key)) {
        onMap.add(key);
        usage[key].maps += 1;
      }
      if (!seen.has(key)) {
        seen.add(key);
        reserved.push({ type: cell.type, index: cell.problemNo });
      }
    }
  }
  return { usage, reserved };
}

async function clearProblemCells(db, keys, session) {
  const maps = await db.collection('maps').find({}, { session }).toArray();
  let changed = false;
  for (const map of maps) {
    let dirty = false;
    const cells = (map.cells || []).map((cell) => {
      if (cell?.kind === 'problem' && keys.has(problemIdentity(cell.type, cell.problemNo))) {
        dirty = true;
        return { kind: 'empty' };
      }
      return cell;
    });
    if (!dirty) continue;
    changed = true;
    await db.collection('maps').updateOne({ id: map.id }, { $set: { cells, updatedAt: new Date() } }, { session });
  }
  return changed;
}

function retargetCell(cell, from, to, swap) {
  if (cell?.kind !== 'problem') return cell;
  const key = problemIdentity(cell.type, cell.problemNo);
  const fromKey = problemIdentity(from.type, from.index);
  const toKey = problemIdentity(to.type, to.index);
  if (key === fromKey) return { ...cell, type: to.type, problemNo: to.index };
  if (swap && key === toKey) return { ...cell, type: from.type, problemNo: from.index };
  return cell;
}

async function findStoredProblem(col, type, index, session) {
  const options = session ? { session } : {};
  return col.findOne({ $or: [{ id: problemIdentity(type, index) }, { type, index }] }, options);
}

function revisionError(res, err) {
  if (err instanceof SaveConflictError) {
    return res.status(409).json({ success: false, message: err.message, conflict: true });
  }
  throw err;
}

async function handlePageMaps(req, res, db, user) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const maps = await db.collection('maps').find({}, { projection: { photo: 0 } }).toArray();
  const revisions = await pageRevisions(db);
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    maps: maps.map((map) => pageMap(map, true)),
    revisions,
    serverNow: Date.now(),
  });
}

async function handlePageMap(req, res, db, user) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const mapId = String(req.query.map || req.query.id || '').trim();
  if (!mapId) return res.status(400).json({ success: false, message: 'Missing map' });
  const map = await db.collection('maps').findOne({ id: mapId });
  if (!map) return res.status(404).json({ success: false, message: 'That map was not found.' });
  const [problems, cellIndex, revisions] = await Promise.all([
    db.collection('problems').find({}, { projection: { index: 1, type: 1, difficulty: 1, score: 1 } }).toArray(),
    mapCellIndex(db),
    pageRevisions(db),
  ]);
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    map: pageMap(map, true),
    problems: problems.map(problemStub),
    reserved: cellIndex.reserved,
    revisions,
    serverNow: Date.now(),
  });
}

async function handleSaveMap(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const map = normalizeMap(body.map);
  if (!map) return res.status(400).json({ success: false, message: 'That map is not valid.' });
  if (map.mode !== 'testing' && map.cells.some((cell) => cell.kind === 'problem' && cell.type === 'testing')) {
    return res.status(400).json({ success: false, message: 'Testing problems can only be placed on a testing map.' });
  }
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'maps', session);
      assertRevision(current, body.revision);
      await db.collection('maps').updateOne(
        { id: map.id },
        { $set: { ...map, updatedAt: new Date() } },
        { upsert: true, session }
      );
      revision = await bumpRevision(db, 'maps', session);
    });
  } catch (err) {
    return revisionError(res, err);
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, revision });
}

async function handleDeleteMap(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const mapId = String(body.mapId || '').trim();
  if (!mapId) return res.status(400).json({ success: false, message: 'Missing map' });
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'maps', session);
      assertRevision(current, body.revision);
      await db.collection('maps').deleteOne({ id: mapId }, { session });
      revision = await bumpRevision(db, 'maps', session);
    });
  } catch (err) {
    return revisionError(res, err);
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, revision });
}

async function handlePageProblems(req, res, db, user) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const [problems, index, revisions] = await Promise.all([
    db.collection('problems').find({}).toArray(),
    mapCellIndex(db),
    pageRevisions(db),
  ]);
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    problems: problems.map((problem) => pageProblem(problem, true)),
    usage: index.usage,
    reserved: index.reserved,
    revisions,
    serverNow: Date.now(),
  });
}

async function handlePageProblem(req, res, db, user) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const type = String(req.query.type || '');
  const index = Number(req.query.index);
  if (!PROBLEM_TYPES.includes(type) || !Number.isInteger(index)) {
    return res.status(400).json({ success: false, message: 'Invalid problem link.' });
  }
  const [problem, keys, cellIndex, revisions] = await Promise.all([
    findStoredProblem(db.collection('problems'), type, index),
    db.collection('problems').find({}, { projection: { index: 1, type: 1 } }).toArray(),
    mapCellIndex(db),
    pageRevisions(db),
  ]);
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    problem: problem ? pageProblem(problem, true) : null,
    keys: keys.filter((item) => PROBLEM_TYPES.includes(item.type) && Number.isInteger(item.index)).map((item) => ({ type: item.type, index: item.index })),
    reserved: cellIndex.reserved,
    usage: cellIndex.usage[problemIdentity(type, index)] || { cells: 0, maps: 0 },
    revisions,
    serverNow: Date.now(),
  });
}

async function handlePageProblemKeys(req, res, db, user) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const [keys, cellIndex, revisions] = await Promise.all([
    db.collection('problems').find({}, { projection: { index: 1, type: 1 } }).toArray(),
    mapCellIndex(db),
    pageRevisions(db),
  ]);
  return res.status(200).json({
    success: true,
    keys: keys.filter((item) => PROBLEM_TYPES.includes(item.type) && Number.isInteger(item.index)).map((item) => ({ type: item.type, index: item.index })),
    reserved: cellIndex.reserved,
    revisions,
    serverNow: Date.now(),
  });
}

async function handlePageProblemText(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
  const wanted = items.filter((item) => PROBLEM_TYPES.includes(item?.type) && Number.isInteger(item?.index));
  if (!wanted.length) return res.status(400).json({ success: false, message: 'No problems were requested.' });
  const problems = await db.collection('problems').find({
    $or: wanted.map((item) => ({ type: item.type, index: item.index })),
  }, { projection: { index: 1, type: 1, prompt: 1 } }).toArray();
  return res.status(200).json({
    success: true,
    problems: problems.map((problem) => ({ index: problem.index, type: problem.type, prompt: problem.prompt || '' })),
    serverNow: Date.now(),
  });
}

async function handleSaveProblem(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const problem = normalizeProblem(body.problem);
  if (!problem) return res.status(400).json({ success: false, message: 'That problem is not valid.' });
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'problems', session);
      assertRevision(current, body.revision);
      const id = problemIdentity(problem.type, problem.index);
      const existing = await findStoredProblem(db.collection('problems'), problem.type, problem.index, session);
      if (existing) {
        await db.collection('problems').updateOne({ _id: existing._id }, { $set: { ...problem, id, updatedAt: new Date() } }, { session });
      } else {
        await db.collection('problems').insertOne({ ...problem, id, updatedAt: new Date() }, { session });
      }
      revision = await bumpRevision(db, 'problems', session);
    });
  } catch (err) {
    return revisionError(res, err);
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, revision });
}

async function handleAddProblems(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const parsed = collectUnique(body.problems, normalizeProblem, (problem) => problemIdentity(problem.type, problem.index), 'Problems');
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  if (!parsed.items.length) return res.status(400).json({ success: false, message: 'Add at least one problem.' });
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'problems', session);
      assertRevision(current, body.revision);
      for (const problem of parsed.items) {
        const existing = await findStoredProblem(db.collection('problems'), problem.type, problem.index, session);
        if (existing) throw new Error(`Problem ${problem.type} ${problem.index} already exists.`);
      }
      const now = new Date();
      await db.collection('problems').insertMany(parsed.items.map((problem) => ({
        ...problem,
        id: problemIdentity(problem.type, problem.index),
        updatedAt: now,
      })), { session });
      revision = await bumpRevision(db, 'problems', session);
    });
  } catch (err) {
    if (err instanceof SaveConflictError) return revisionError(res, err);
    return res.status(400).json({ success: false, message: err.message || 'Could not add problems.' });
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, revision, count: parsed.items.length });
}

async function handleDeleteProblems(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const items = (Array.isArray(body.problems) ? body.problems : [body]).filter((item) => PROBLEM_TYPES.includes(item?.type) && Number.isInteger(item?.index));
  if (!items.length) return res.status(400).json({ success: false, message: 'Missing problem' });
  const keys = new Set(items.map((item) => problemIdentity(item.type, item.index)));
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'problems', session);
      assertRevision(current, body.revision);
      await db.collection('problems').deleteMany({ $or: items.map((item) => ({ type: item.type, index: item.index })) }, { session });
      const mapsChanged = await clearProblemCells(db, keys, session);
      revision = await bumpRevision(db, 'problems', session);
      if (mapsChanged) await bumpRevision(db, 'maps', session);
    });
  } catch (err) {
    return revisionError(res, err);
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, revision });
}

async function handleMoveProblem(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const from = body.from;
  const to = body.to;
  if (!PROBLEM_TYPES.includes(from?.type) || !Number.isInteger(from?.index) || !PROBLEM_TYPES.includes(to?.type) || !Number.isInteger(to?.index)) {
    return res.status(400).json({ success: false, message: 'That problem move is not valid.' });
  }
  if (from.type === to.type && from.index === to.index) {
    const revisions = await pageRevisions(db);
    return res.status(200).json({ success: true, revision: revisions.problems });
  }
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'problems', session);
      assertRevision(current, body.revision);
      const col = db.collection('problems');
      const source = await findStoredProblem(col, from.type, from.index, session);
      if (!source) throw new Error('That problem was not found.');
      const dest = await findStoredProblem(col, to.type, to.index, session);
      const fromId = problemIdentity(from.type, from.index);
      const toId = problemIdentity(to.type, to.index);
      if (dest && String(dest._id) !== String(source._id)) {
        await col.updateOne({ _id: dest._id }, { $set: { id: `swap-${dest._id}` } }, { session });
        await col.updateOne({ _id: source._id }, { $set: { id: toId, type: to.type, index: to.index, updatedAt: new Date() } }, { session });
        await col.updateOne({ _id: dest._id }, { $set: { id: fromId, type: from.type, index: from.index, updatedAt: new Date() } }, { session });
      } else {
        await col.updateOne({ _id: source._id }, { $set: { id: toId, type: to.type, index: to.index, updatedAt: new Date() } }, { session });
      }
      const maps = await db.collection('maps').find({}, { session }).toArray();
      let mapsChanged = false;
      for (const map of maps) {
        let dirty = false;
        const cells = (map.cells || []).map((cell) => {
          const next = retargetCell(cell, from, to, Boolean(dest));
          if (next !== cell) dirty = true;
          return next;
        });
        if (!dirty) continue;
        mapsChanged = true;
        await db.collection('maps').updateOne({ id: map.id }, { $set: { cells, updatedAt: new Date() } }, { session });
      }
      revision = await bumpRevision(db, 'problems', session);
      if (mapsChanged) await bumpRevision(db, 'maps', session);
    });
  } catch (err) {
    if (err instanceof SaveConflictError) return revisionError(res, err);
    return res.status(400).json({ success: false, message: err.message || 'Could not move that problem.' });
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, revision });
}

async function handlePageContests(req, res, db, user) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const [contests, maps, revisions] = await Promise.all([
    db.collection('contests').find({}).toArray(),
    db.collection('maps').aggregate(mapSummaryPipeline()).toArray(),
    pageRevisions(db),
  ]);
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    contests: contests.map((contest) => ({
      id: contest.id,
      name: contest.name,
      mapId: contest.mapId,
      mapIds: contestMapIds(contest),
      startAt: Number.isInteger(contest.startAt) ? contest.startAt : null,
      durationMinutes: Number.isInteger(contest.durationMinutes) ? contest.durationMinutes : null,
      spawnMinutes: Number.isInteger(contest.spawnMinutes) ? contest.spawnMinutes : null,
      readyMinutes: Number.isInteger(contest.readyMinutes) ? contest.readyMinutes : null,
      mode: contest.mode === 'testing' ? 'testing' : 'competition',
      spawnMode: contest.spawnMode === 'random' ? 'random' : 'choose',
    })),
    maps: maps.map((map) => pageMap(map, false)),
    revisions,
    serverNow: Date.now(),
  });
}

async function handleSaveContest(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const contest = normalizeContest(body.contest);
  if (!contest) return res.status(400).json({ success: false, message: 'That contest is not valid.' });
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'contests', session);
      assertRevision(current, body.revision);
      const stored = await db.collection('contests').findOne({ id: contest.id }, { session });
      await db.collection('contests').updateOne(
        { id: contest.id },
        { $set: contestStoredUpdate(contest, stored) },
        { upsert: true, session }
      );
      revision = await bumpRevision(db, 'contests', session);
    });
  } catch (err) {
    return revisionError(res, err);
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, revision });
}

async function handleDeleteContest(req, res, db, user, body) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const contestId = String(body.contestId || '').trim();
  if (!contestId) return res.status(400).json({ success: false, message: 'Missing contest' });
  const session = getMongoClient().startSession();
  let revision = 0;
  try {
    await session.withTransaction(async () => {
      const current = await readRevision(db, 'contests', session);
      assertRevision(current, body.revision);
      await db.collection('contests').deleteOne({ id: contestId }, { session });
      revision = await bumpRevision(db, 'contests', session);
    });
  } catch (err) {
    return revisionError(res, err);
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, revision });
}

async function problemsOnMaps(db, maps, projection) {
  const wanted = [];
  const seen = new Set();
  for (const map of maps) {
    for (const cell of map.cells || []) {
      if (cell?.kind !== 'problem' || !PROBLEM_TYPES.includes(cell.type) || !Number.isInteger(cell.problemNo)) continue;
      const key = problemIdentity(cell.type, cell.problemNo);
      if (seen.has(key)) continue;
      seen.add(key);
      wanted.push({ type: cell.type, index: cell.problemNo });
    }
  }
  if (!wanted.length) return [];
  const options = projection ? { projection } : {};
  return db.collection('problems').find({ $or: wanted }, options).toArray();
}

function mapSummaryPipeline() {
  return [
    { $project: {
      _id: 0,
      id: 1,
      name: 1,
      cols: 1,
      rows: 1,
      mode: 1,
      spawnPoints: {
        $size: {
          $filter: {
            input: { $ifNull: ['$cells', []] },
            as: 'cell',
            cond: { $eq: ['$$cell.kind', 'spawnpoint'] },
          },
        },
      },
    } },
  ];
}

async function handlePageContest(req, res, db, user) {
  if (!isAdmin(user)) return res.status(403).json({ success: false, message: 'Admin only' });
  const contestId = String(req.query.id || req.query.contest || '').trim();
  if (!contestId) return res.status(400).json({ success: false, message: 'Missing contest' });
  const col = db.collection('contests');
  let contest = await col.findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found.' });
  const ids = contestMapIds(contest);
  const [catalogDocs, boardDocs, revisions] = await Promise.all([
    db.collection('maps').aggregate(mapSummaryPipeline()).toArray(),
    db.collection('maps').find({ id: { $in: ids } }).toArray(),
    pageRevisions(db),
  ]);
  const idSet = new Set(ids);
  contest = await maybeResolveSpawns(db, contest, boardDocs.filter((map) => idSet.has(map.id)), Date.now());
  const maps = boardDocs.filter((map) => new Set(contestMapIds(contest)).has(map.id));
  const problems = await problemsOnMaps(db, maps, { index: 1, type: 1, difficulty: 1, score: 1 });
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    contest: {
      ...withSchedule(contest, contestPayload(contest, maps, problems, user).contest),
      contestantIds: Array.isArray(contest.contestantIds) ? contest.contestantIds : [],
    },
    maps: maps.map((map) => pageMap(map, true)),
    catalog: catalogDocs.map((map) => pageMap(map, false)),
    problems: problems.map(problemStub),
    revisions,
    serverNow: Date.now(),
  });
}

async function handlePagePlay(req, res, db, user) {
  const contestId = String(req.query.contest || req.query.id || '').trim();
  if (!contestId) return res.status(400).json({ success: false, message: 'Missing contest' });
  let contest = await db.collection('contests').findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found.' });
  if (!isAdmin(user) && !teamForUser(contest, user.username)) {
    return res.status(403).json({ success: false, message: 'You are not on a team in this contest.' });
  }
  let maps = await loadContestMaps(db, contest);
  contest = await maybeResolveSpawns(db, contest, maps, Date.now());
  maps = await loadContestMaps(db, contest);
  const storedProblems = await problemsOnMaps(db, maps, { index: 1, type: 1, difficulty: 1, score: 1 });
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    contest: withSchedule(contest, contestPayload(contest, maps, storedProblems, user).contest),
    maps: maps.map((map) => pageMap(map, true)),
    problems: storedProblems.map(problemStub),
    serverNow: Date.now(),
  });
}

async function handlePageStudentContests(req, res, db, user) {
  const contests = await db.collection('contests').find({}, {
    projection: { claims: 0, energy: 0, spawnVotes: 0, spawnChoices: 0, spawns: 0 },
  }).toArray();
  const mine = isAdmin(user) ? contests : contests.filter((contest) => teamForUser(contest, user.username));
  const mapIds = [...new Set(mine.flatMap((contest) => contestMapIds(contest)))];
  const maps = mapIds.length
    ? await db.collection('maps').find({ id: { $in: mapIds } }, { projection: { id: 1, name: 1 } }).toArray()
    : [];
  const names = new Map(maps.map((map) => [map.id, map.name]));
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    contests: mine.map((contest) => ({
      id: contest.id,
      name: contest.name,
      mapId: contest.mapId,
      mapIds: contestMapIds(contest),
      mapNames: contestMapIds(contest).map((id) => names.get(id)).filter(Boolean),
      startAt: Number.isInteger(contest.startAt) ? contest.startAt : null,
      teams: cleanTeams(contest.teams).filter((team) => isAdmin(user) || team.members.some((member) => sameName(member, user.username))),
    })),
    serverNow: Date.now(),
  });
}

async function handlePageAnswer(req, res, db, user) {
  const contestId = String(req.query.contest || '').trim();
  const cell = Number(req.query.cell);
  if (!contestId || !Number.isInteger(cell) || cell < 0) {
    return res.status(400).json({ success: false, message: 'This problem link is not valid.' });
  }
  const contest = await db.collection('contests').findOne({ id: contestId });
  if (!contest) return res.status(404).json({ success: false, message: 'Contest not found.' });
  if (!isAdmin(user) && !teamForUser(contest, user.username)) {
    return res.status(403).json({ success: false, message: 'You are not on a team in this contest.' });
  }
  const requested = String(req.query.map || '');
  const mapId = contestMapIds(contest).includes(requested) ? requested : primaryMapId(contest);
  const map = mapId
    ? await db.collection('maps').findOne({ id: mapId }, { projection: { photo: 0 } })
    : null;
  const mapCell = map?.cells?.[cell];
  if (!map || mapCell?.kind !== 'problem') {
    return res.status(404).json({ success: false, message: 'That problem is not available.' });
  }
  const stored = await db.collection('problems').findOne(
    { type: mapCell.type, index: mapCell.problemNo },
    { projection: { index: 1, type: 1, prompt: 1, difficulty: 1, score: 1 } }
  );
  const problem = stored ? pageProblem(stored, false) : {
    index: mapCell.problemNo,
    type: mapCell.type,
    prompt: '',
    difficulty: 'normal',
    score: problemScore(null),
  };
  return res.status(200).json({
    success: true,
    contest: withSchedule(contest, contestPayload(contest, [map], stored ? [stored] : [], user).contest),
    mapId,
    problem,
    serverNow: Date.now(),
  });
}

async function handlePageCredits(req, res, db, user) {
  return res.status(200).json({
    success: true,
    user: pageUser(user),
    versions: await listVersions(db),
    serverNow: Date.now(),
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
      case 'page-maps':     return await handlePageMaps(req, res, db, user);
      case 'page-map':      return await handlePageMap(req, res, db, user);
      case 'save-map':      return await handleSaveMap(req, res, db, user, body);
      case 'delete-map':    return await handleDeleteMap(req, res, db, user, body);
      case 'page-problems': return await handlePageProblems(req, res, db, user);
      case 'page-problem':  return await handlePageProblem(req, res, db, user);
      case 'page-problem-keys': return await handlePageProblemKeys(req, res, db, user);
      case 'page-problem-text': return await handlePageProblemText(req, res, db, user, body);
      case 'save-problem':  return await handleSaveProblem(req, res, db, user, body);
      case 'add-problems':  return await handleAddProblems(req, res, db, user, body);
      case 'delete-problems': return await handleDeleteProblems(req, res, db, user, body);
      case 'move-problem':  return await handleMoveProblem(req, res, db, user, body);
      case 'page-contests': return await handlePageContests(req, res, db, user);
      case 'page-contest':  return await handlePageContest(req, res, db, user);
      case 'save-contest':  return await handleSaveContest(req, res, db, user, body);
      case 'delete-contest': return await handleDeleteContest(req, res, db, user, body);
      case 'page-play':     return await handlePagePlay(req, res, db, user);
      case 'page-student-contests': return await handlePageStudentContests(req, res, db, user);
      case 'page-answer':   return await handlePageAnswer(req, res, db, user);
      case 'page-credits':  return await handlePageCredits(req, res, db, user);
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
      case 'claim-teleport': return await handleClaimTeleport(req, res, db, user, body);
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

