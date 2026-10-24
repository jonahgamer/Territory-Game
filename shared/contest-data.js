import { contestantId, sameContestant } from "./session.js?v=roles";
import { contestSchedule, serverNow } from "./contest-time.js";
import { cleanEnergyLedger, energyNow, readEnergySettings } from "./energy.js";
import { contestMapIds, primaryMapId, cleanTeleports } from "./contest-board.js";

export function normalizeTeams(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t) => t && typeof t.id === "string" && typeof t.name === "string" && Array.isArray(t.members))
    .map((t) => {
      const members = [];
      for (const m of t.members.map((x) => String(x || "").trim()).filter(Boolean)) {
        if (members.some((x) => sameContestant(x, m))) continue;
        members.push(m);
      }
      return { id: t.id, name: t.name, members };
    })
    .filter((t) => t.members.length >= 1 && t.members.length <= 5);
}

export function normalizeTeamCells(value, fallbackMapId = "") {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const item of value) {
    if (!item || typeof item.teamId !== "string" || !Number.isInteger(item.cell) || item.cell < 0) continue;
    const mapId = typeof item.mapId === "string" && item.mapId ? item.mapId : fallbackMapId;
    if (!mapId) continue;
    const i = items.findIndex((x) => x.teamId === item.teamId);
    if (i >= 0) items.splice(i, 1);
    items.push({ teamId: item.teamId, mapId, cell: item.cell });
  }
  return items;
}

export function normalizeSpawnVotes(value, fallbackMapId = "") {
  if (!Array.isArray(value)) return [];
  const votes = [];
  for (const v of value) {
    if (!v || typeof v.teamId !== "string" || typeof v.username !== "string" || !Number.isInteger(v.cell) || v.cell < 0) continue;
    const mapId = typeof v.mapId === "string" && v.mapId ? v.mapId : fallbackMapId;
    if (!mapId) continue;
    const i = votes.findIndex((x) => x.teamId === v.teamId && sameContestant(x.username, v.username));
    if (i >= 0) votes.splice(i, 1);
    votes.push({ teamId: v.teamId, username: v.username, mapId, cell: v.cell });
  }
  return votes;
}

export function normalizeClaims(value, fallbackMapId = "") {
  if (!Array.isArray(value)) return [];
  const claims = [];
  const seen = new Set();
  for (const c of value) {
    if (!c || typeof c.teamId !== "string" || !Number.isInteger(c.cell) || c.cell < 0) continue;
    const mapId = typeof c.mapId === "string" && c.mapId ? c.mapId : fallbackMapId;
    if (!mapId) continue;
    const key = `${mapId}:${c.cell}:${c.teamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({
      mapId,
      cell: c.cell,
      teamId: c.teamId,
      solvedBy: typeof c.solvedBy === "string" ? c.solvedBy : "",
      solvedAt: Number.isFinite(c.solvedAt) ? c.solvedAt : 0,
    });
  }
  return claims;
}

export function normalizeContest(raw) {
  const teams = normalizeTeams(raw.teams);
  const energy = readEnergySettings(raw);
  const mapIds = contestMapIds(raw);
  const fallback = mapIds[0] || "";
  return {
    id: raw.id,
    name: raw.name,
    mapId: primaryMapId(raw),
    mapIds,
    teleports: cleanTeleports(raw.teleports, mapIds),
    contestantIds: teams.flatMap((t) => t.members),
    teams,
    startAt: Number.isInteger(raw.startAt) ? raw.startAt : null,
    durationMinutes: Number.isInteger(raw.durationMinutes) ? raw.durationMinutes : null,
    spawnMinutes: Number.isInteger(raw.spawnMinutes) ? raw.spawnMinutes : null,
    readyMinutes: Number.isInteger(raw.readyMinutes) ? raw.readyMinutes : null,
    mode: raw.mode === "testing" ? "testing" : "competition",
    spawnMode: raw.spawnMode === "random" ? "random" : "choose",
    energyRegen: energy.regen,
    energyRegenSeconds: energy.regenSeconds,
    energyAttemptCost: energy.attemptCost,
    energyAttemptMin: energy.attemptMin,
    energySolveBelow: energy.solveBelow,
    energySolve: energy.solve,
    energy: cleanEnergyLedger(raw.energy),
    resolvedTeams: Array.isArray(raw.resolvedTeams) ? raw.resolvedTeams.filter((id) => typeof id === "string") : [],
    spawnChoices: normalizeTeamCells(raw.spawnChoices, fallback),
    spawnVotes: normalizeSpawnVotes(raw.spawnVotes, fallback),
    spawns: normalizeTeamCells(raw.spawns, fallback),
    claims: normalizeClaims(raw.claims, fallback),
    spawnResolved: raw.spawnResolved === true,
  };
}

// Kept off the difficulty hues (yellow, green, red, purple) and the type hues
// (cyan, blue, orange, pink, lime) so a team mark stays visible on a cell.
const TEAM_HUES = [302, 158, 106, 246];
const TEAM_LIGHTS = [46, 34, 60];

export function teamColor(contest, teamId) {
  const found = (contest?.teams || []).findIndex((team) => team.id === teamId);
  const slot = found < 0 ? 0 : found;
  const hue = TEAM_HUES[slot % TEAM_HUES.length];
  const light = TEAM_LIGHTS[Math.floor(slot / TEAM_HUES.length) % TEAM_LIGHTS.length];
  return `hsl(${hue} 78% ${light}%)`;
}

export function teamShort(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(name || "").trim().slice(0, 3).toUpperCase();
}

export function teamEnergy(contest, teamId, now = serverNow()) {
  const schedule = contestSchedule(contest);
  const stored = cleanEnergyLedger(contest?.energy).find((entry) => entry.teamId === teamId) || null;
  return energyNow({
    settings: readEnergySettings(contest),
    liveAt: schedule?.liveAt,
    endAt: schedule?.endAt,
    now,
    stored,
  });
}

export function teamForUser(contest, username = contestantId()) {
  return (contest?.teams || []).find((team) =>
    (team.members || []).some((m) => sameContestant(m, username))
  ) || null;
}

export function agreedSpawnChoices(contest) {
  const choices = [];
  for (const team of contest?.teams || []) {
    const votes = (contest.spawnVotes || []).filter((v) =>
      v.teamId === team.id && team.members.some((m) => sameContestant(m, v.username))
    );
    if (votes.length !== team.members.length) continue;
    const cell = votes[0].cell;
    const mapId = votes[0].mapId;
    if (votes.every((v) => v.cell === cell && v.mapId === mapId)) choices.push({ teamId: team.id, mapId, cell });
  }
  return choices;
}