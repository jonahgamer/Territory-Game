import { contestantId, sameContestant } from "./session.js";
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
    const claim = {
      mapId,
      cell: c.cell,
      teamId: c.teamId,
      solvedBy: typeof c.solvedBy === "string" ? c.solvedBy : "",
      solvedAt: Number.isFinite(c.solvedAt) ? c.solvedAt : 0,
      complete: c.complete !== false,
    };
    if (Array.isArray(c.solvedParts)) {
      claim.solvedParts = [...new Set(c.solvedParts.filter((index) => Number.isInteger(index) && index >= 0))].sort((a, b) => a - b);
    }
    if (Number.isFinite(Number(c.score)) && Number(c.score) >= 0) claim.score = Math.round(Number(c.score) * 10) / 10;
    claims.push(claim);
  }
  return claims;
}

function cleanHiddenRuleSettings(value) {
  const reveal = value?.reveal === "periodic" ? "periodic" : "minutes";
  const order = value?.order === "random" ? "random" : "designated";
  const period = Number(value?.periodMinutes);
  const items = [];
  const seen = new Set();
  for (const raw of Array.isArray(value?.items) ? value.items : []) {
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    if (!id || id.length > 40 || seen.has(id)) continue;
    seen.add(id);
    const minute = raw?.revealMinute === null || raw?.revealMinute === "" ? null : Number(raw?.revealMinute);
    const item = {
      id,
      revealMinute: Number.isInteger(minute) && minute >= 0 && minute <= 10080 ? minute : null,
      hidden: raw?.hidden === true,
    };
    if (id === "map-multiplier") {
      const factor = Math.round(Number(raw?.multiplier) * 10) / 10;
      item.mapId = typeof raw?.mapId === "string" ? raw.mapId : "";
      item.multiplier = Number.isFinite(factor) && factor >= 0.1 && factor <= 10 ? factor : 1;
    }
    if (id === "cell-steal") {
      const seconds = Number(raw?.seconds);
      item.seconds = Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : 45;
    }
    if (id === "solve-burst") {
      const count = Number(raw?.count);
      const seconds = Number(raw?.seconds);
      const points = Math.round(Number(raw?.points) * 10) / 10;
      item.count = Number.isInteger(count) && count >= 2 && count <= 30 ? count : 3;
      item.seconds = Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : 60;
      item.points = Number.isFinite(points) && points >= 0.1 && points <= 100 ? points : 1;
    }
    items.push(item);
    if (items.length >= 40) break;
  }
  return {
    reveal,
    order,
    periodMinutes: Number.isInteger(period) && period >= 1 && period <= 10080 ? period : 10,
    items,
  };
}

function cleanRectangleBonus(value) {
  if (!Array.isArray(value)) return null;
  const awards = [];
  const seen = new Set();
  for (const award of value) {
    if (!award || typeof award.teamId !== "string" || !Number.isInteger(award.bonus) || award.bonus < 0) continue;
    if (!Number.isInteger(award.area) || award.area < 0 || seen.has(award.teamId)) continue;
    seen.add(award.teamId);
    awards.push({ teamId: award.teamId, bonus: award.bonus, area: award.area });
  }
  return awards;
}

function cleanTouchBonus(value) {
  if (!Array.isArray(value)) return null;
  const awards = [];
  const seen = new Set();
  for (const award of value) {
    if (!award || typeof award.teamId !== "string" || !Number.isInteger(award.bonus) || award.bonus < 0) continue;
    if (seen.has(award.teamId)) continue;
    seen.add(award.teamId);
    awards.push({ teamId: award.teamId, bonus: award.bonus });
  }
  return awards;
}

export function pointsLabel(points) {
  const n = Math.round(Number(points) * 10) / 10;
  if (!Number.isFinite(n)) return "0 points";
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${shown} point${Math.abs(n) === 1 ? "" : "s"}`;
}

const SCORING_RULES = new Set(["same-type-run", "map-multiplier", "cell-steal", "touch-bonus", "territory-rectangle", "solve-burst"]);

export function scoringRule(id) {
  return SCORING_RULES.has(id);
}

export function rulePointsFor(contest, teamId, ruleId) {
  const found = (contest?.rulePoints || []).find((row) => row.teamId === teamId && row.id === ruleId);
  return found ? found.points : 0;
}

function cleanRulePoints(value) {
  if (!Array.isArray(value)) return [];
  const rows = [];
  const seen = new Set();
  for (const row of value) {
    if (!row || typeof row.teamId !== "string" || typeof row.id !== "string") continue;
    const points = Math.round(Number(row.points) * 10) / 10;
    if (!Number.isFinite(points)) continue;
    const key = `${row.teamId}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ teamId: row.teamId, id: row.id, points });
  }
  return rows;
}

function cleanNotices(value) {
  if (!Array.isArray(value)) return [];
  const notices = [];
  for (const notice of value) {
    if (!notice || typeof notice.id !== "string" || typeof notice.teamId !== "string" || typeof notice.text !== "string") continue;
    notices.push({ id: notice.id.slice(0, 80), teamId: notice.teamId, text: notice.text.slice(0, 240) });
  }
  return notices.slice(0, 40);
}

export function formatMark(value) {
  const n = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function contestScoreParts(score, touchBonus, rectangle, ended) {
  const parts = [{ value: score, detail: "Marks from solved problems." }];
  if (Number.isFinite(touchBonus)) {
    parts.push({
      value: touchBonus,
      detail: "Extra marks added at the end, one for each other team whose territory touches this team.",
    });
  }
  if (ended && rectangle && Number.isInteger(rectangle.bonus) && Number.isInteger(rectangle.area)) {
    const cells = rectangle.area === 1 ? "cell" : "cells";
    parts.push({
      value: rectangle.bonus,
      detail: `The largest rectangle inside this territory covers ${rectangle.area} ${cells}. Half of that, rounded down, is ${rectangle.bonus}.`,
    });
  }
  return parts;
}

export function formatContestScore(score, touchBonus, rectangle, ended) {
  const parts = contestScoreParts(score, touchBonus, rectangle, ended);
  const base = formatMark(parts[0].value);
  if (parts.length === 1) {
    const n = Math.round(Number(score) * 10) / 10;
    return `${base} point${n === 1 ? "" : "s"}`;
  }
  if (!ended) return `${base} +${formatMark(parts[1].value)}`;
  const bits = parts.map((part) => formatMark(part.value));
  const total = formatMark(bits.reduce((sum, bit) => sum + Number(bit), 0));
  return `${total} (${bits.join("+")})`;
}

export function fillContestScore(node, score, touchBonus, rectangle, ended) {
  if (!node) return;
  node.replaceChildren();
  const parts = contestScoreParts(score, touchBonus, rectangle, ended);
  const mark = (part) => {
    const span = document.createElement("span");
    span.className = "score-part";
    span.textContent = formatMark(part.value);
    span.dataset.scoreDetail = part.detail;
    return span;
  };
  if (parts.length === 1) {
    node.append(mark(parts[0]), document.createTextNode(Math.round(Number(score) * 10) / 10 === 1 ? " point" : " points"));
    return;
  }
  if (!ended) {
    node.append(mark(parts[0]), document.createTextNode(" +"), mark(parts[1]));
    return;
  }
  const bits = parts.map((part) => formatMark(part.value));
  const total = formatMark(bits.reduce((sum, bit) => sum + Number(bit), 0));
  const totalPart = document.createElement("span");
  totalPart.className = "score-part";
  totalPart.textContent = total;
  totalPart.dataset.scoreDetail = parts.map((part) => `${formatMark(part.value)}: ${part.detail}`).join(" ");
  node.append(totalPart, document.createTextNode(" ("));
  parts.forEach((part, index) => {
    if (index) node.append(document.createTextNode("+"));
    node.append(mark(part));
  });
  node.append(document.createTextNode(")"));
}

export function bindScoreTooltip() {
  if (document.body.dataset.scoreTooltip === "1") return;
  document.body.dataset.scoreTooltip = "1";
  const tip = document.querySelector("#score-tooltip");
  if (!tip) return;
  document.addEventListener("mouseover", (event) => {
    const part = event.target.closest?.(".score-part");
    if (!part) return;
    tip.textContent = part.dataset.scoreDetail || "";
    tip.hidden = false;
    const box = part.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 300))}px`;
    tip.style.top = `${box.bottom + 6}px`;
  });
  document.addEventListener("mouseout", (event) => {
    const part = event.target.closest?.(".score-part");
    if (!part || part.contains(event.relatedTarget)) return;
    tip.hidden = true;
  });
}

function cleanRuleBlocks(value) {
  if (!Array.isArray(value)) return [];
  const blocks = [];
  const seen = new Set();
  for (const block of value) {
    if (!block || typeof block.mapId !== "string" || !block.mapId || !Number.isInteger(block.cell) || block.cell < 0) continue;
    const key = `${block.mapId}:${block.cell}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push({ mapId: block.mapId, cell: block.cell });
  }
  return blocks;
}

function cleanRevealedRules(value) {
  if (!Array.isArray(value)) return [];
  const rules = [];
  for (const rule of value) {
    if (!rule || typeof rule.id !== "string" || typeof rule.title !== "string" || typeof rule.text !== "string") continue;
    rules.push({
      id: rule.id,
      title: rule.title,
      text: rule.text,
      minute: Number.isInteger(rule.minute) ? rule.minute : null,
    });
  }
  return rules;
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
    hiddenRules: cleanHiddenRuleSettings(raw.hiddenRules),
    revealedRules: cleanRevealedRules(raw.revealedRules),
    ruleBlocks: cleanRuleBlocks(raw.ruleBlocks),
    touchBonus: cleanTouchBonus(raw.touchBonus),
    rectangleBonus: cleanRectangleBonus(raw.rectangleBonus),
    rulePoints: cleanRulePoints(raw.rulePoints),
    notices: cleanNotices(raw.notices),
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