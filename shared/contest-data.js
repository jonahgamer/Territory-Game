import { sameContestant } from "./session.js";

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

export function normalizeTeamCells(value) {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const item of value) {
    if (!item || typeof item.teamId !== "string" || !Number.isInteger(item.cell) || item.cell < 0) continue;
    const i = items.findIndex((x) => x.teamId === item.teamId);
    if (i >= 0) items.splice(i, 1);
    items.push({ teamId: item.teamId, cell: item.cell });
  }
  return items;
}

export function normalizeSpawnVotes(value) {
  if (!Array.isArray(value)) return [];
  const votes = [];
  for (const v of value) {
    if (!v || typeof v.teamId !== "string" || typeof v.username !== "string" || !Number.isInteger(v.cell) || v.cell < 0) continue;
    const i = votes.findIndex((x) => x.teamId === v.teamId && sameContestant(x.username, v.username));
    if (i >= 0) votes.splice(i, 1);
    votes.push({ teamId: v.teamId, username: v.username, cell: v.cell });
  }
  return votes;
}

export function normalizeClaims(value) {
  if (!Array.isArray(value)) return [];
  const claims = [];
  const seen = new Set();
  for (const c of value) {
    if (!c || typeof c.teamId !== "string" || !Number.isInteger(c.cell) || seen.has(c.cell)) continue;
    seen.add(c.cell);
    claims.push({
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
  return {
    id: raw.id,
    name: raw.name,
    mapId: raw.mapId,
    contestantIds: teams.flatMap((t) => t.members),
    teams,
    startAt: Number.isInteger(raw.startAt) ? raw.startAt : null,
    durationMinutes: Number.isInteger(raw.durationMinutes) ? raw.durationMinutes : null,
    spawnMinutes: Number.isInteger(raw.spawnMinutes) ? raw.spawnMinutes : null,
    readyMinutes: Number.isInteger(raw.readyMinutes) ? raw.readyMinutes : null,
    mode: raw.mode === "testing" ? "testing" : "competition",
    resolvedTeams: Array.isArray(raw.resolvedTeams) ? raw.resolvedTeams.filter((id) => typeof id === "string") : [],
    spawnChoices: normalizeTeamCells(raw.spawnChoices),
    spawnVotes: normalizeSpawnVotes(raw.spawnVotes),
    spawns: normalizeTeamCells(raw.spawns),
    claims: normalizeClaims(raw.claims),
    spawnResolved: raw.spawnResolved === true,
  };
}

export function teamForUser(contest, username) {
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
    if (votes.every((v) => v.cell === cell)) choices.push({ teamId: team.id, cell });
  }
  return choices;
}