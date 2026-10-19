import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { api } from "../shared/api.js";
import { el, renderList } from "../shared/dom.js";
import {
  contestPhase, contestSchedule, phaseClock, phaseSentence, readSchedule,
  formatContestPicker, formatContestTime, noteServerTime,
} from "../shared/contest-time.js";
import { normalizeContest, teamForUser } from "../shared/contest-data.js";
import { layoutMapGrid, mapMode, paintPhotoGrid } from "../shared/map-render.js";
import { DIFFICULTY_SCORE, DIFFICULTY_NAME } from "../shared/constants.js";
import { typeInfo, problemDifficulty, problemTag } from "../shared/difficulty.js";



const contestId = new URLSearchParams(location.search).get("id") || "";
const state = {
  contests: [], maps: [], problems: [], revisions: { contests: 0 },
  current: null, map: null, editingTeamId: null, adminViewTeamId: null,
  syncAt: 0, clock: null, lastMouse: Date.now(),
};

async function run() {
  if (!contestId) throw new Error("No contest selected.");
  const data = await loadBootstrap();
  state.contests = data.contests;
  state.maps = data.maps;
  state.problems = data.problems;
  state.revisions = data.revisions;
  state.current = state.contests.find((c) => c.id === contestId) || null;
  if (!state.current) throw new Error("Contest not found.");
  state.map = state.maps.find((m) => m.id === state.current.mapId) || null;

  bindEvents();
  render();
  startClock();
}

function bindEvents() {
  document.querySelector("#contest-name-input")?.addEventListener("input", () => {
    const name = document.querySelector("#contest-name-input").value.trim();
    if (!name || name.length > 60) return;
    state.current.name = name;
    document.querySelector("#contest-title").textContent = name;
    persistContests();
  });
  document.querySelector("#contest-map-input")?.addEventListener("change", () => {
    const mapId = document.querySelector("#contest-map-input").value;
    if (!state.maps.some((m) => m.id === mapId) || state.current.mapId === mapId) return;
    state.current.mapId = mapId;
    state.current.spawns = [];
    state.current.spawnChoices = [];
    state.current.spawnVotes = [];
    state.current.claims = [];
    state.current.spawnResolved = false;
    state.map = state.maps.find((m) => m.id === mapId) || null;
    updateSpawnNote();
    render();
    persistContests();
  });
  for (const id of ["#contest-start-input", "#contest-duration-input", "#contest-spawn-input", "#contest-ready-input"]) {
    document.querySelector(id)?.addEventListener("change", commitSchedule);
  }
  document.querySelector("#delete-open-contest")?.addEventListener("click", deleteContest);
  document.querySelector("#team-form")?.addEventListener("submit", saveTeam);
  document.querySelector("#team-cancel-edit")?.addEventListener("click", resetTeamForm);
  document.querySelector("#contestant-list")?.addEventListener("click", onTeamListClick);
  document.querySelector("#contest-mode-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-contest-mode]");
    if (!btn) return;
    const mode = btn.dataset.contestMode === "testing" ? "testing" : "competition";
    if (state.current.mode === mode) return;
    state.current.mode = mode;
    state.current.spawns = []; state.current.spawnChoices = []; state.current.spawnVotes = [];
    state.current.claims = []; state.current.spawnResolved = false; state.current.resolvedTeams = [];
    state.adminViewTeamId = null;
    render(); persistContests();
  });
  document.querySelector("#testing-team-view")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-view-team]");
    if (!btn) return;
    state.adminViewTeamId = btn.dataset.viewTeam;
    renderTestingTeamView();
    renderBoard();
  });
  document.addEventListener("mousemove", () => {
    const wasIdle = Date.now() - state.lastMouse >= 5000;
    state.lastMouse = Date.now();
    if (wasIdle) state.syncAt = 0;
  }, { passive: true });
}

function isTestingContest() { return state.current.mode === "testing"; }

function contestAsTeam(contest, teamId) {
  if (!isTestingContest() || !teamId) return contest;
  return {
    ...contest,
    teams: (contest.teams || []).filter((t) => t.id === teamId),
    spawnResolved: (contest.resolvedTeams || []).includes(teamId),
    spawnChoices: (contest.spawnChoices || []).filter((c) => c.teamId === teamId),
    spawnVotes: (contest.spawnVotes || []).filter((v) => v.teamId === teamId),
    spawns: (contest.spawns || []).filter((s) => s.teamId === teamId),
    claims: (contest.claims || []).filter((c) => c.teamId === teamId),
  };
}

function render() {
  const c = state.current;
  document.querySelector("#contest-title").textContent = c.name;
  document.querySelector("#contest-name-input").value = c.name;
  fillMapSelect();
  fillSchedule();
  updateSpawnNote();
  renderMode();

  document.querySelector("#contest-mode-note").textContent = isTestingContest()
    ? "Testing contest. Each team plays its own copy of the map. Changing this clears scores and spawn points."
    : "Competition. Every team shares one map. Changing this clears scores and spawn points.";
  document.querySelector("#contest-team-lead").textContent = isTestingContest()
    ? "Add as many teams as you need. Each team has 1 to 5 students and plays alone on this map."
    : "A team has 1 to 5 students and shares one spawn point, territory, and score.";
  document.querySelector("#contest-leaderboard-heading").textContent = isTestingContest() ? "Team scores" : "Leaderboard";

  renderTestingTeamView();
  renderTeams();
  renderLeaderboard();
  renderBoard();
  paintClock();
}

function fillMapSelect() {
  const select = document.querySelector("#contest-map-input");
  if (!select) return;
  const wanted = isTestingContest() ? "testing" : "official";
  select.replaceChildren();
  for (const m of state.maps) {
    const mode = mapMode(m);
    if (mode !== wanted && m.id !== state.current.mapId) continue;
    const opt = el("option", null, `${m.name} · ${m.cols} × ${m.rows}${mode === "testing" ? " · Testing" : ""}`);
    opt.value = m.id;
    select.append(opt);
  }
  if (state.current.mapId && state.maps.some((m) => m.id === state.current.mapId)) {
    select.value = state.current.mapId;
  }
}

function fillSchedule() {
  const c = state.current;
  document.querySelector("#contest-start-input").value = Number.isInteger(c.startAt) ? formatContestPicker(c.startAt) : "";
  document.querySelector("#contest-duration-input").value = Number.isInteger(c.durationMinutes) ? String(c.durationMinutes) : "";
  document.querySelector("#contest-spawn-input").value = Number.isInteger(c.spawnMinutes) ? String(c.spawnMinutes) : "";
  document.querySelector("#contest-ready-input").value = Number.isInteger(c.readyMinutes) ? String(c.readyMinutes) : "";
}

function updateSpawnNote() {
  const note = document.querySelector("#contest-map-edit-note");
  const map = state.map;
  if (!map) { note.hidden = true; return; }
  const count = (map.cells || []).filter((c) => c.kind === "spawnpoint").length;
  note.hidden = false;
  note.textContent = count === 0
    ? `${map.name} has no spawn points yet. Place them on the map.`
    : `${map.name} has ${count} spawn point${count === 1 ? "" : "s"}.`;
}

function commitSchedule() {
  const c = state.current;
  const schedule = readSchedule(
    document.querySelector("#contest-start-input").value,
    document.querySelector("#contest-duration-input").value,
    document.querySelector("#contest-spawn-input").value,
    document.querySelector("#contest-ready-input").value
  );
  const error = document.querySelector("#contest-schedule-error");
  if (schedule.error) { error.hidden = false; error.textContent = schedule.error; return; }
  error.hidden = true;
  c.startAt = schedule.startAt;
  c.durationMinutes = schedule.durationMinutes;
  c.spawnMinutes = schedule.spawnMinutes;
  c.readyMinutes = schedule.readyMinutes;
  persistContests();
}

function renderMode() {
  const mode = isTestingContest() ? "testing" : "competition";
  for (const btn of document.querySelectorAll("[data-contest-mode]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.contestMode === mode));
  }
}

function renderTestingTeamView() {
  const wrap = document.querySelector("#testing-team-view");
  if (!wrap) return;
  wrap.hidden = !isTestingContest();
  wrap.replaceChildren();
  if (!isTestingContest()) return;
  if (!state.adminViewTeamId || !(state.current.teams || []).some((t) => t.id === state.adminViewTeamId)) {
    state.adminViewTeamId = state.current.teams?.[0]?.id || null;
  }
  for (const team of state.current.teams || []) {
    const btn = el("button", null, team.name);
    btn.type = "button";
    btn.dataset.viewTeam = team.id;
    btn.setAttribute("aria-pressed", String(team.id === state.adminViewTeamId));
    wrap.append(btn);
  }
}

function renderTeams() {
  const list = document.querySelector("#contestant-list");
  const empty = document.querySelector("#contestant-empty");
  const teams = state.current.teams || [];
  empty.hidden = teams.length > 0;
  list.hidden = teams.length === 0;
  renderList(list, teams, (team) => {
    const item = el("li");
    if (team.id === state.editingTeamId) item.classList.add("editing");
    const name = el("span", "contest-name-label");
    name.append(el("span", "team-color-dot"), document.createTextNode(team.name));
    const detail = el("span", "team-detail",
      `${team.members.length} member${team.members.length === 1 ? "" : "s"} · ${team.members.join(" · ")}`);
    const edit = el("button", "account-action", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => beginEdit(team));
    const remove = el("button", "account-action danger", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => removeTeam(team));
    item.append(name, detail, edit, remove);
    return item;
  });
}

function beginEdit(team) {
  state.editingTeamId = team.id;
  document.querySelector("#team-name").value = team.name;
  document.querySelector("#team-members").value = team.members.join("\n");
  document.querySelector("#team-submit").textContent = "Save team";
  document.querySelector("#team-cancel-edit").hidden = false;
  document.querySelector("#team-edit-note").hidden = false;
  document.querySelector("#team-edit-note").textContent = "Editing an existing team. Removed members lose their spawn pick.";
}

function resetTeamForm() {
  state.editingTeamId = null;
  document.querySelector("#team-name").value = "";
  document.querySelector("#team-members").value = "";
  document.querySelector("#team-submit").textContent = "Add team";
  document.querySelector("#team-cancel-edit").hidden = true;
  document.querySelector("#team-edit-note").hidden = true;
  document.querySelector("#team-form-error").hidden = true;
}

async function saveTeam(event) {
  event.preventDefault();
  const name = document.querySelector("#team-name").value.trim();
  const members = document.querySelector("#team-members").value
    .split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const formError = document.querySelector("#team-form-error");

  if (!name || name.length > 60) { formError.hidden = false; formError.textContent = "Give the team a name."; return; }
  if (members.length < 1 || members.length > 5 || new Set(members.map((m) => m.toLowerCase())).size !== members.length) {
    formError.hidden = false;
    formError.textContent = "Enter 1 to 5 different students, one per line.";
    return;
  }
  const dup = (state.current.teams || []).some((t) =>
    t.id !== state.editingTeamId && t.name.trim().toLowerCase() === name.toLowerCase());
  if (dup) { formError.hidden = false; formError.textContent = "Another team already has that name."; return; }
  formError.hidden = true;

  const body = { contestId: state.current.id, name, members };
  if (state.editingTeamId) body.teamId = state.editingTeamId;
  try {
    const data = await api.saveTeam(body);
    applyPlayState(data);
    resetTeamForm();
    render();
  } catch (err) {
    formError.hidden = false;
    formError.textContent = err.message;
  }
}

function applyPlayState(data) {
  const next = data?.contest;
  if (!next) return;
  state.current.teams = next.teams || state.current.teams;
  state.current.spawnResolved = next.spawnResolved === true;
  state.current.resolvedTeams = next.resolvedTeams || [];
  state.current.spawnChoices = next.spawnChoices || [];
  state.current.spawnVotes = next.spawnVotes || [];
  state.current.spawns = next.spawns || [];
  state.current.claims = next.claims || [];
  if (next.mode) state.current.mode = next.mode;
  noteServerTime(data.serverNow);
}

async function removeTeam(team) {
  if (!window.confirm(`Remove team ${team.name}?`) || !window.confirm(`Remove ${team.name} now?`)) return;
  try {
    const data = await api.removeTeam({ contestId: state.current.id, teamId: team.id });
    applyPlayState(data);
    if (state.editingTeamId === team.id) resetTeamForm();
    render();
  } catch (err) {
    showPageToast(err.message, "warn");
  }
}

function renderLeaderboard() {
  const rows = buildLeaderboard(state.current);
  const list = document.querySelector("#contest-leaderboard");
  const empty = document.querySelector("#contest-leaderboard-empty");
  empty.hidden = rows.length > 0;
  list.hidden = rows.length === 0;
  renderList(list, rows, (row) => {
    const item = el("li", "leaderboard-row");
    item.append(
      el("span", "leaderboard-rank", `${rows.indexOf(row) + 1}.`),
      el("span", "leaderboard-team", row.name),
      el("span", "leaderboard-stat", `${row.score} point${row.score === 1 ? "" : "s"}`),
      el("span", "leaderboard-stat", `${row.solved} solved`),
      el("span", "leaderboard-stat", `${row.territory} cell${row.territory === 1 ? "" : "s"}`)
    );
    return item;
  });
}

function buildLeaderboard(contest) {
  const map = state.map;
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
      const d = problemDifficulty(p);
      score += DIFFICULTY_SCORE[d] || 0;
      solved += 1;
    }
    return { teamId: team.id, name: team.name, score, solved, territory };
  }).sort((a, b) => b.score - a.score || b.solved - a.solved || a.name.localeCompare(b.name));
}

function renderBoard() {
  const grid = document.querySelector("#contest-grid");
  if (!grid) return;
  if (!state.map) { grid.replaceChildren(); return; }
  const contest = isTestingContest() ? contestAsTeam(state.current, state.adminViewTeamId) : state.current;
  grid.dataset.cols = String(state.map.cols);
  grid.dataset.rows = String(state.map.rows);
  layoutMapGrid(grid, state.map.cols, state.map.rows);
  grid.replaceChildren();
  state.map.cells.forEach((cell, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(index);
    button.className = `grid-cell ${cell.kind}${cell.kind === "problem" ? ` ${cell.type} ${problemDifficulty(findBoardProblem(cell))}` : ""}`;
    const owner = ownerAt(contest, index, cell);
    if (owner) {
      button.classList.add("owned");
      button.style.setProperty("--team", `hsl(${(state.current.teams.indexOf(owner) * 137.508 + 8) % 360} 82% 62%)`);
    }
    button.disabled = true;
    grid.append(button);
  });
  paintPhotoGrid(grid, state.map, findBoardProblem);
}

function findBoardProblem(index, type) {
  return state.problems.find((p) => p.index === index && p.type === type) || null;
}

function ownerAt(contest, index, cell) {
  const claim = (contest.claims || []).find((c) => c.cell === index);
  if (claim) return (contest.teams || []).find((t) => t.id === claim.teamId) || null;
  if (cell?.kind !== "spawnpoint" || !contest.spawnResolved) return null;
  const spawn = (contest.spawns || []).find((s) => s.cell === index);
  return spawn ? (contest.teams || []).find((t) => t.id === spawn.teamId) || null : null;
}

function paintClock() {
  const node = document.querySelector("#contest-countdown");
  if (!node) return;
  const text = phaseClock(state.current);
  node.hidden = !text;
  node.textContent = text;
}

function startClock() {
  if (state.clock) return;
  state.clock = setInterval(() => {
    if (!document.querySelector("#contest-view") && !document.querySelector("#contest-grid")) {
      clearInterval(state.clock); state.clock = null; return;
    }
    paintClock();
    syncContest().catch(() => {});
  }, 2000);
}

async function syncContest() {
  const now = Date.now();
  const gap = document.hidden ? 60000 : (now - state.lastMouse >= 5000 ? 20000 : 5000);
  if (now - state.syncAt < gap) return;
  state.syncAt = now;
  try {
    const data = await api.contestState(state.current.id);
    applyPlayState(data);
    render();
  } catch {}
}

async function deleteContest() {
  if (!window.confirm(`Delete the contest ${state.current.name}?`) || !window.confirm(`Delete ${state.current.name} now?`)) return;
  state.contests = state.contests.filter((c) => c.id !== state.current.id);
  try {
    await api.saveContests(state.contests, state.revisions.contests);
    location.assign("/admin/contests.html");
  } catch (err) {
    showPageToast(err.message, "warn");
  }
}

async function persistContests() {
  try {
    const data = await api.saveContests(state.contests, state.revisions.contests);
    state.revisions.contests = data.revision;
  } catch (err) {
    showPageToast(err.message || "Could not save contest.", "warn");
  }
}

async function onTeamListClick(event) {
  const edit = event.target.closest("[data-edit-team]");
  if (edit) { const team = state.current.teams.find((t) => t.id === edit.dataset.editTeam); if (team) beginEdit(team); return; }
  const remove = event.target.closest("[data-remove-team]");
  if (remove) { const team = state.current.teams.find((t) => t.id === remove.dataset.removeTeam); if (team) removeTeam(team); }
}
if (requireAdmin()) {
  initNav("contests");
  bindToastClose();
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message || "Could not open the contest."; }
  });
}