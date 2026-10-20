import { requireContestant, getSession, sameContestant } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { api } from "../shared/api.js";
import { el, renderList } from "../shared/dom.js";
import {
  contestPhase, phaseSentence, phaseClock, noteServerTime, formatContestTime,
} from "../shared/contest-time.js";
import { teamForUser, agreedSpawnChoices, normalizeTeamCells, normalizeSpawnVotes, normalizeClaims, normalizeTeams } from "../shared/contest-data.js";
import { layoutMapGrid, mapBackdrop, cellClassName, cellText, cellLabel, paintPhotoGrid } from "../shared/map-render.js";
import { DIFFICULTY_NAME, DIFFICULTY_SCORE, ANSWER_OPEN_MODE_KEY } from "../shared/constants.js";
import { problemDifficulty, problemTag } from "../shared/difficulty.js";
import { createStatementView } from "../shared/statement.js";

// ── 顶层常量 ─────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const contestId = params.get("contest") || "";

// ── 状态 ─────────────────────────────────────────────────
const state = {
  maps: [], problems: [], contest: null,
  selectedCell: null, syncAt: 0, clock: null, lastMouse: Date.now(),
  phase: "", frozen: false, spawnCache: new Map(),
};

// ── Statement view ───────────────────────────────────────
const statement = createStatementView(document.querySelector("#student-problem-prompt"), {
  onAnswerValue: (v) => { document.querySelector("#student-answer").value = v; },
  onAnswerStyle: (css) => { document.querySelector("#student-answer").style.cssText = css; },
  onAnswerReadOnly: (ro) => { document.querySelector("#student-answer").readOnly = ro; },
  onAnswerError: (hidden, text) => {
    const e = document.querySelector("#student-answer-error");
    e.hidden = hidden; e.textContent = text;
  },
});

// ── 函数 ─────────────────────────────────────────────────
async function run() {
  if (!contestId) throw new Error("No contest selected.");
  const data = await loadBootstrap();
  state.maps = data.maps;
  state.problems = data.problems;
  state.contest = data.contests.find((c) => c.id === contestId) || null;
  if (!state.contest) throw new Error("Contest not found.");
  if (!teamForUser(state.contest)) throw new Error("You are not on a team in this contest.");
  bindEvents();
  render();
  startClock();
}

function bindEvents() {
  document.querySelector("#student-problem-close")?.addEventListener("click", closeProblem);
  const grid = document.querySelector("#student-grid");
  grid?.addEventListener("click", onGridClick);
  grid?.addEventListener("pointerover", showCellTip);
  grid?.addEventListener("pointermove", showCellTip);
  grid?.addEventListener("pointerout", (event) => {
    if (event.target.closest(".grid-cell") && event.relatedTarget?.closest?.("#student-grid .grid-cell") === event.target.closest(".grid-cell")) return;
    const tip = document.querySelector("#cell-tooltip");
    if (tip && !event.relatedTarget?.closest?.("#student-grid")) tip.hidden = true;
  });
  document.querySelector("#student-answer-form")?.addEventListener("submit", submitAnswer);
  document.addEventListener("mousemove", () => {
    const wasIdle = Date.now() - state.lastMouse >= 5000;
    state.lastMouse = Date.now();
    if (wasIdle) state.syncAt = 0;
  }, { passive: true });
}

function answerOpenMode() {
  const username = getSession()?.user?.username || "";
  const key = username ? `${ANSWER_OPEN_MODE_KEY}:${username}` : ANSWER_OPEN_MODE_KEY;
  try { return localStorage.getItem(key) === "newtab" ? "newtab" : "current"; }
  catch { return "current"; }
}

function render() {
  const contest = state.contest;
  const map = state.maps.find((m) => m.id === contest.mapId);
  const team = teamForUser(contest);
  const phase = contestPhase(contest);
  const frozen = isFrozen(contest, map);
  state.phase = phase;
  state.frozen = frozen;

  document.querySelector("#student-play-title").textContent = contest.name;
  document.querySelector("#student-joined").hidden = false;
  document.querySelector("#student-joined").textContent = `Team ${team.name}. You are ${getSession()?.user?.username}.`;

  const board = buildLeaderboard(contest, map);
  const row = board.find((b) => b.teamId === team.id);
  const rank = board.findIndex((b) => b.teamId === team.id);
  const ownedCells = (contest.spawnResolved && (contest.spawns || []).some((s) => s.teamId === team.id) ? 1 : 0)
    + (contest.claims || []).filter((c) => c.teamId === team.id).length;
  const summary = document.querySelector("#student-team-summary");
  summary.hidden = false;
  summary.textContent = `Members: ${team.members.join(", ")} · Score: ${row?.score ?? 0} · Territory: ${ownedCells} cell${ownedCells === 1 ? "" : "s"} · Rank ${rank < 0 ? "—" : rank + 1} of ${board.length}.`;

  writeStatus(contest, phase, map, frozen);
  renderRoster(contest, map, phase);
  renderLeaderboard(board);
  const showScores = phase === "live" || phase === "ended" || frozen;
  document.querySelector("#student-leaderboard").hidden = !showScores;
  document.querySelector("#student-leaderboard-heading").hidden = !showScores;
  document.querySelector("#student-board").hidden = !map;

  if (!map) {
    document.querySelector("#spawn-agreement").hidden = true;
    paintClock();
    return;
  }
  renderGrid(contest, map, phase, frozen, team);
  renderSpawnAgreement(contest, map, phase);
  paintClock();
}

function writeStatus(contest, phase, map, frozen) {
  const mapBit = map ? `${map.name} · ${map.cols} × ${map.rows}` : "The map for this contest has been removed.";
  const team = teamForUser(contest);
  const score = buildLeaderboard(contest, map).find((r) => r.teamId === team?.id);
  const scoreBit = score ? ` ${team.name} has ${score.score} point${score.score === 1 ? "" : "s"}.` : "";
  document.querySelector("#student-play-meta").textContent = `${mapBit}. ${phaseSentence(contest, phase, frozen)}${scoreBit}`;
  const note = document.querySelector("#student-spawn-note");
  if (!map) { note.hidden = true; return; }
  note.hidden = false;
  const finalSpawn = contest.spawnResolved ? (contest.spawns || []).find((s) => s.teamId === team?.id) : null;
  if (finalSpawn && map.cells[finalSpawn.cell]?.kind === "spawnpoint") {
    note.textContent = `Your team starts at row ${Math.floor(finalSpawn.cell / map.cols) + 1}, column ${(finalSpawn.cell % map.cols) + 1}.`;
    return;
  }
  if (phase === "spawn" && !contest.spawnResolved) {
    const count = (map.cells || []).filter((c) => c.kind === "spawnpoint").length;
    note.textContent = count > 0 ? "Click the spawn point you want. It becomes your team's choice when every member picks that cell." : "This map has no spawn points.";
    return;
  }
  if (phase === "before") {
    note.textContent = contest.spawnMode === "random"
      ? "The map is visible. Your team will be placed on a random spawn point when the wait starts."
      : "The map is visible. Spawning has not started.";
    return;
  }
  note.textContent = "Your team does not have a spawn point.";
}

function renderRoster(contest, map, phase) {
  const roster = document.querySelector("#team-roster");
  const body = document.querySelector("#team-roster-body");
  if (!roster || !body) return;
  const team = teamForUser(contest);
  const show = Boolean(team && map) && (phase === "ready" || (phase === "spawn" && contest.spawnResolved));
  roster.hidden = !show;
  if (!show) return;
  body.replaceChildren();
  const row = document.createElement("tr");
  const name = document.createElement("td");
  const dot = el("span", "team-color-dot");
  dot.style.setProperty("--team", `hsl(${(state.contest.teams.indexOf(team) * 137.508 + 8) % 360} 82% 62%)`);
  name.append(dot, document.createTextNode(team.name));
  const members = el("td", "team-members-cell");
  for (const m of team.members || []) members.append(el("span", "team-member-chip", m));
  const spawn = document.createElement("td");
  const spawnCell = (contest.spawns || []).find((s) => s.teamId === team.id);
  spawn.textContent = spawnCell && map.cells[spawnCell.cell]?.kind === "spawnpoint"
    ? `row ${Math.floor(spawnCell.cell / map.cols) + 1}, column ${(spawnCell.cell % map.cols) + 1}`
    : "No spawn point";
  row.append(name, members, spawn);
  body.append(row);
}

function renderLeaderboard(rows) {
  const list = document.querySelector("#student-leaderboard");
  renderList(list, rows, (row) => {
    const item = el("li", "leaderboard-row");
    const idx = rows.indexOf(row) + 1;
    item.append(
      el("span", "leaderboard-rank", `${idx}.`),
      el("span", "leaderboard-team", row.name),
      el("span", "leaderboard-stat", `${row.score} point${row.score === 1 ? "" : "s"}`),
      el("span", "leaderboard-stat", `${row.solved} solved`),
      el("span", "leaderboard-stat", `${row.territory} cell${row.territory === 1 ? "" : "s"}`)
    );
    return item;
  });
}

function buildLeaderboard(contest, map) {
  const spawns = contest.spawnResolved ? (contest.spawns || []) : [];
  return (contest.teams || []).map((team) => {
    let score = 0, solved = 0;
    let territory = spawns.some((s) => s.teamId === team.id) ? 1 : 0;
    for (const claim of contest.claims || []) {
      if (claim.teamId !== team.id) continue;
      territory += 1;
      const cell = map?.cells?.[claim.cell];
      if (!cell || cell.kind !== "problem") continue;
      const p = state.problems.find((x) => x.index === cell.problemNo && x.type === cell.type);
      const d = p?.difficulty || "normal";
      score += DIFFICULTY_SCORE[d] || 0;
      solved += 1;
    }
    return { teamId: team.id, name: team.name, score, solved, territory };
  }).sort((a, b) => b.score - a.score || b.solved - a.solved || a.name.localeCompare(b.name));
}

function isFrozen(contest, map) {
  if (!contest || !map) return contestPhase(contest) === "ended";
  if (contestPhase(contest) === "ended") return true;
  const problems = (map.cells || []).map((c, i) => c.kind === "problem" ? i : -1).filter((i) => i >= 0);
  if (problems.length === 0) return false;
  const claimed = new Set((contest.claims || []).map((c) => c.cell));
  return problems.every((i) => claimed.has(i));
}

function renderGrid(contest, map, phase, frozen, team) {
  const grid = document.querySelector("#student-grid");
  grid.dataset.cols = String(map.cols);
  grid.dataset.rows = String(map.rows);
  layoutMapGrid(grid, map.cols, map.rows);
  grid.replaceChildren();

  const choosing = phase === "spawn" && !contest.spawnResolved && contest.spawnMode !== "random";
  map.cells.forEach((cell, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(index);
    const claim = (contest.claims || []).find((c) => c.cell === index);
    const owner = ownerAt(contest, index, cell);

    if (owner && owner.id === team.id) {
      button.className = cellClassName(cell, findProblem, "grid-cell", "student-cell");
      button.classList.add("owned", "mine");
      button.style.setProperty("--team", `hsl(${(contest.teams.indexOf(owner) * 137.508 + 8) % 360} 82% 62%)`);
      button.classList.add("territory-dot");
      button.disabled = true;
    } else if (owner) {
      button.className = cellClassName(cell, findProblem, "grid-cell", "student-cell");
      button.classList.add("taken");
      button.style.setProperty("--team", `hsl(${(contest.teams.indexOf(owner) * 137.508 + 8) % 360} 82% 62%)`);
      button.disabled = true;
    } else {
      button.className = cellClassName(cell, findProblem, "grid-cell", "student-cell");
      const reachable = phase === "live" && !frozen && cell.kind === "problem" && !claim && adjacentToTeam(map, contest, team.id, index);
      const canSpawn = choosing && cell.kind === "spawnpoint";
      button.disabled = !(reachable || canSpawn);
      if (canSpawn) {
        const myVote = (contest.spawnVotes || []).find((v) => v.teamId === team.id && sameContestant(v.username, getSession()?.user?.username));
        if (myVote && myVote.cell === index) button.classList.add("mine");
      }
      button.textContent = mapBackdrop(map) === "photo" || cell.kind === "problem" ? "" : cellText(cell);
    }

    if (state.selectedCell === index) button.setAttribute("aria-pressed", "true");
    button.setAttribute("aria-label", cellLabel(cell, Math.floor(index / map.cols) + 1, (index % map.cols) + 1));
    grid.append(button);
  });
  paintPhotoGrid(grid, map, findProblem);
}

function showCellTip(event) {
  const tip = document.querySelector("#cell-tooltip");
  const button = event.target.closest?.(".grid-cell");
  if (!tip || !button) return;
  const contest = state.contest;
  const map = state.maps.find((m) => m.id === contest?.mapId);
  const index = Number(button.dataset.index);
  const cell = map?.cells?.[index];
  if (!map || !cell) { tip.hidden = true; return; }
  tip.replaceChildren(...cellTipLines(contest, map, index, cell).map((line) => el("p", "", line)));
  tip.hidden = false;
  const pad = 14;
  tip.style.left = "0px";
  tip.style.top = "0px";
  const box = tip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - pad;
  if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function cellTipLines(contest, map, index, cell) {
  const row = Math.floor(index / map.cols) + 1;
  const column = (index % map.cols) + 1;
  const lines = [`Row ${row}, column ${column}`];
  if (cell.kind === "problem") {
    const problem = findProblem(cell.problemNo, cell.type);
    const difficulty = problemDifficulty(problem);
    const points = DIFFICULTY_SCORE[difficulty] || 0;
    lines.push(`${problemTag(cell.problemNo, cell.type)} · ${DIFFICULTY_NAME[difficulty] || "Normal"} · ${points} point${points === 1 ? "" : "s"}`);
  } else if (cell.kind === "obstacle") lines.push("Obstacle");
  else if (cell.kind === "spawnpoint") lines.push("Spawn point");
  else lines.push("Empty");
  const claim = (contest.claims || []).find((c) => c.cell === index);
  if (claim) {
    const team = (contest.teams || []).find((t) => t.id === claim.teamId);
    const when = claim.solvedAt ? formatContestTime(claim.solvedAt) : "";
    const who = claim.solvedBy ? ` · ${claim.solvedBy}` : "";
    lines.push(`Occupied by ${team?.name || "a team"}${who}${when ? ` at ${when}` : ""}`);
  } else if (cell.kind === "spawnpoint" && contest.spawnResolved) {
    const spawn = (contest.spawns || []).find((s) => s.cell === index);
    const team = spawn ? (contest.teams || []).find((t) => t.id === spawn.teamId) : null;
    if (team) lines.push(`Held by ${team.name}`);
  }
  return lines;
}

function findProblem(index, type) {
  return state.problems.find((p) => p.index === index && p.type === type) || null;
}

function ownerAt(contest, index, cell) {
  const claim = (contest.claims || []).find((c) => c.cell === index);
  if (claim) return (contest.teams || []).find((t) => t.id === claim.teamId) || null;
  if (cell?.kind !== "spawnpoint" || !contest.spawnResolved) return null;
  const spawn = (contest.spawns || []).find((s) => s.cell === index);
  return spawn ? (contest.teams || []).find((t) => t.id === spawn.teamId) || null : null;
}

function adjacentToTeam(map, contest, teamId, cell) {
  if (!teamId || !map || !Number.isInteger(cell)) return false;
  const owned = new Set();
  if (contest.spawnResolved) for (const s of contest.spawns || []) if (s.teamId === teamId) owned.add(s.cell);
  for (const c of contest.claims || []) if (c.teamId === teamId) owned.add(c.cell);
  const row = Math.floor(cell / map.cols);
  const col = cell % map.cols;
  const neighbors = [];
  if (col > 0) neighbors.push(cell - 1);
  if (col + 1 < map.cols) neighbors.push(cell + 1);
  if (row > 0) neighbors.push(cell - map.cols);
  if (row + 1 < map.rows) neighbors.push(cell + map.cols);
  return neighbors.some((i) => owned.has(i));
}

function renderSpawnAgreement(contest, map, phase) {
  const wrap = document.querySelector("#spawn-agreement");
  const body = document.querySelector("#spawn-votes");
  const team = teamForUser(contest);
  const open = Boolean(team && map && phase === "spawn" && !contest.spawnResolved);
  wrap.hidden = !open;
  if (!open) return;
  body.replaceChildren();
  const me = getSession()?.user?.username;
  for (const member of team.members) {
    const vote = (contest.spawnVotes || []).find((v) => v.teamId === team.id && sameContestant(v.username, member));
    const row = document.createElement("tr");
    row.append(el("td", null, sameContestant(member, me) ? `${member} (you)` : member));
    row.append(el("td", null, vote ? `row ${Math.floor(vote.cell / map.cols) + 1}, column ${(vote.cell % map.cols) + 1}` : "Waiting"));
    const status = el("td", "member-status");
    const icon = el("i", vote ? "fa-solid fa-circle-check vote-yes" : "fa-solid fa-circle-question vote-no");
    icon.setAttribute("aria-label", vote ? "Voted" : "Not voted yet");
    status.append(icon);
    row.append(status);
    body.append(row);
  }
  const agreed = (contest.spawnChoices || []).find((c) => c.teamId === team.id);
  const currentCell = Number.isInteger(agreed?.cell) ? agreed.cell : null;
  const key = `${contest.id}:${team.id}`;
  const prev = state.spawnCache.get(key);
  if (prev !== undefined && prev !== currentCell) {
    showPageToast(currentCell === null ? "Not all team members have chosen the same spawn point yet." : `Spawn point: row ${Math.floor(currentCell / map.cols) + 1}, column ${(currentCell % map.cols) + 1}`, currentCell === null ? "warn" : "ok");
  }
  state.spawnCache.set(key, currentCell);
  document.querySelector("#spawn-agreement-note").textContent = agreed
    ? `Spawn point: row ${Math.floor(agreed.cell / map.cols) + 1}, column ${(agreed.cell % map.cols) + 1}`
    : "Spawn point: not agreed yet. Every team member must choose the same cell.";
}

async function onGridClick(event) {
  const button = event.target.closest("[data-index]");
  if (!button || button.disabled) return;
  const contest = state.contest;
  const map = state.maps.find((m) => m.id === contest.mapId);
  const team = teamForUser(contest);
  if (!map || !team) return;
  const index = Number(button.dataset.index);
  const cell = map.cells[index];
  const phase = contestPhase(contest);

  if (cell?.kind === "spawnpoint" && phase === "spawn" && !contest.spawnResolved && contest.spawnMode !== "random") {
    await chooseSpawn(contest, index);
    return;
  }
  if (cell?.kind === "problem" && phase === "live" && !isFrozen(contest, map)) {
    const claim = (contest.claims || []).some((c) => c.cell === index);
    if (claim || !adjacentToTeam(map, contest, team.id, index)) return;
    if (answerOpenMode() === "newtab") {
      const url = new URL("/answer.html", location.origin);
      url.searchParams.set("contest", contest.id);
      url.searchParams.set("cell", String(index));
      window.open(url.href, "_blank", "noopener");
      return;
    }
    state.selectedCell = index;
    render();
    showProblem(contest, map, phase);
  }
}

function showProblem(contest, map, phase) {
  const team = teamForUser(contest);
  const cell = map.cells[state.selectedCell];
  const claim = (contest.claims || []).find((c) => c.cell === state.selectedCell);
  const playable = phase === "live" && !isFrozen(contest, map) && cell?.kind === "problem" && !claim && adjacentToTeam(map, contest, team.id, state.selectedCell);
  const panel = document.querySelector("#student-problem");
  const form = document.querySelector("#student-answer-form");
  if (!playable) { panel.hidden = true; form.hidden = true; return; }

  const problem = findProblem(cell.problemNo, cell.type);
  panel.hidden = false;
  const d = problem?.difficulty || "normal";
  const pts = DIFFICULTY_SCORE[d] || 2;
  document.querySelector("#student-problem-tag").textContent = `${DIFFICULTY_NAME[d] || "Normal"} · ${pts} point${pts === 1 ? "" : "s"}`;
  form.hidden = false;
  document.querySelector("#student-answer-error").hidden = true;
  document.querySelector("#student-answer-success").hidden = true;
  const input = document.querySelector("#student-answer");
  input.style.cssText = "";
  input.readOnly = false;
  const prompt = problem?.prompt?.trim() ? problem.prompt : "This problem has no text yet.";
  statement.render(prompt, document.querySelector("#student-problem-tag").textContent);
  if (!input.readOnly) input.focus();
}

function closeProblem() {
  const panel = document.querySelector("#student-problem");
  if (panel.hidden) return;
  state.selectedCell = null;
  panel.hidden = true;
  document.querySelector("#student-answer-form").hidden = true;
  document.querySelector("#student-answer-success").hidden = true;
  for (const b of document.querySelectorAll("#student-grid [aria-pressed='true']")) b.removeAttribute("aria-pressed");
}

async function chooseSpawn(contest, cell) {
  const team = teamForUser(contest);
  if (!team) return;
  const username = getSession()?.user?.username;
  const prevVotes = (contest.spawnVotes || []).slice();
  const prevChoices = (contest.spawnChoices || []).slice();
  contest.spawnVotes = prevVotes.filter((v) => !(v.teamId === team.id && sameContestant(v.username, username)));
  contest.spawnVotes.push({ teamId: team.id, username, cell });
  contest.spawnChoices = agreedSpawnChoices(contest);
  render();
  try {
    const data = await api.chooseSpawn(contest.id, cell);
    applyPlayState(data);
    const map = state.maps.find((m) => m.id === contest.mapId);
    const finalSpawn = (contest.spawns || []).find((s) => s.teamId === team.id);
    const agreed = (contest.spawnChoices || []).find((c) => c.teamId === team.id);
    const chosen = Number.isInteger(finalSpawn?.cell) ? finalSpawn.cell : agreed?.cell;
    if (map && Number.isInteger(chosen)) {
      showPageToast(`Spawn point: row ${Math.floor(chosen / map.cols) + 1}, column ${(chosen % map.cols) + 1}`, "ok");
    } else {
      showPageToast("Not all team members have chosen the same spawn point yet.", "warn");
    }
  } catch (err) {
    contest.spawnVotes = prevVotes;
    contest.spawnChoices = prevChoices;
    showPageToast(err.message, "warn");
  }
  render();
}

async function submitAnswer(event) {
  event.preventDefault();
  const contest = state.contest;
  const map = state.maps.find((m) => m.id === contest.mapId);
  const team = teamForUser(contest);
  if (!contest || !map || !team || state.selectedCell === null) return;
  const cell = state.selectedCell;
  const submit = document.querySelector("#student-answer-form button");
  if (submit.disabled) return;
  const label = submit.textContent;
  submit.disabled = true; submit.textContent = "Checking...";
  const errorEl = document.querySelector("#student-answer-error");
  errorEl.hidden = true;

  const approval = await statement.approveSubmit();
  if (approval.blocked) {
    submit.disabled = false; submit.textContent = label;
    errorEl.hidden = false;
    errorEl.textContent = approval.message || "Finish the problem before submitting.";
    return;
  }

  const prevClaims = (contest.claims || []).slice();
  const pending = { cell, teamId: team.id, solvedBy: getSession()?.user?.username, solvedAt: Date.now(), pending: true };
  contest.claims = prevClaims.filter((c) => c.cell !== cell).concat(pending);
  render();

  let failure = "";
  try {
    const data = await api.solve(contest.id, cell, document.querySelector("#student-answer").value);
    applyPlayState(data);
    document.querySelector("#student-answer").value = "";
    document.querySelector("#student-answer-form").hidden = true;
    const success = document.querySelector("#student-answer-success");
    success.hidden = false;
    success.textContent = "Answer accepted. Close this problem to continue.";
  } catch (err) {
    contest.claims = prevClaims;
    failure = err.message;
  }
  submit.disabled = false; submit.textContent = label;
  render();
  if (failure) {
    errorEl.hidden = false;
    errorEl.textContent = failure;
  }
}

function applyPlayState(data) {
  const next = data?.contest;
  if (!next) return;
  const c = state.contest;
  if (Array.isArray(next.teams)) { c.teams = normalizeTeams(next.teams); c.contestantIds = c.teams.flatMap((t) => t.members); }
  if (typeof next.spawnResolved === "boolean") c.spawnResolved = next.spawnResolved;
  if (next.mode) c.mode = next.mode;
  if (Array.isArray(next.resolvedTeams)) c.resolvedTeams = next.resolvedTeams;
  if (Array.isArray(next.spawnChoices)) c.spawnChoices = normalizeTeamCells(next.spawnChoices);
  if (Array.isArray(next.spawnVotes)) c.spawnVotes = normalizeSpawnVotes(next.spawnVotes);
  if (Array.isArray(next.spawns)) c.spawns = normalizeTeamCells(next.spawns);
  if (Array.isArray(next.claims)) c.claims = normalizeClaims(next.claims);
  noteServerTime(data.serverNow);
}

function paintClock() {
  const node = document.querySelector("#student-countdown");
  if (!node) return;
  const text = phaseClock(state.contest);
  node.hidden = !text;
  node.textContent = text;
}

function startClock() {
  if (state.clock) return;
  state.clock = setInterval(() => {
    if (!document.querySelector("#student-grid")) { clearInterval(state.clock); state.clock = null; return; }
    paintClock();
    const phase = contestPhase(state.contest);
    const map = state.maps.find((m) => m.id === state.contest.mapId);
    const frozen = isFrozen(state.contest, map);
    const sig = `${phase}:${frozen}:${state.contest.spawnResolved}`;
    if (sig !== `${state.phase}:${state.frozen}:${state.contest.spawnResolved}`) render();
    else writeStatus(state.contest, phase, map, frozen);
    syncContest().catch(() => {});
  }, 2000);
}

async function syncContest() {
  const now = Date.now();
  const gap = document.hidden ? 60000 : (now - state.lastMouse >= 5000 ? 20000 : 5000);
  if (now - state.syncAt < gap) return;
  state.syncAt = now;
  try {
    const data = await api.contestState(state.contest.id);
    applyPlayState(data);
    render();
  } catch {}
}

// ── 启动（最后） ─────────────────────────────────────────
if (requireContestant()) {
  initNav("contests");
  bindToastClose();
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message || "Could not open the contest."; }
  });
}