import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { el, renderList } from "../shared/dom.js";
import {
  contestPhase, contestSchedule, phaseClock, phaseSentence, readSchedule,
  formatContestPicker, formatContestTime, noteServerTime,
} from "../shared/contest-time.js";
import { normalizeContest, teamColor, teamEnergy, teamForUser, teamShort } from "../shared/contest-data.js";
import { layoutMapGrid, mapMode, mapBackdrop, paintPhotoGrid, cellClassName, fillCellLabel } from "../shared/map-render.js";
import { problemScore } from "../shared/difficulty.js";
import { contestMapIds, primaryMapId, teleportLabel, nextTeleportLabel, placeKey } from "../shared/contest-board.js";
import { drawTeleportLinks } from "../shared/teleport-link.js";
import { watchContestPatch } from "../shared/contest-sync.js";
import { mergeEnergyLedger } from "../shared/energy.js";



const contestId = new URLSearchParams(location.search).get("id") || "";
const state = {
  contests: [], maps: [], problems: [], revisions: { contests: 0 },
  current: null, map: null, editingTeamId: null, adminViewTeamId: null,
  students: [],
  syncAt: 0, clock: null, lastMouse: Date.now(),
};

async function run() {
  if (!contestId) throw new Error("No contest selected.");
  const data = await loadPage("page-contest", { id: contestId });
  state.current = data.contest;
  state.contests = state.current ? [state.current] : [];
  state.maps = data.maps || [];
  state.catalog = data.catalog || [];
  state.problems = data.problems || [];
  state.revisions = data.revisions;
  if (!state.current) throw new Error("Contest not found.");
  state.mapsForContest = contestMaps();
  try {
    const accounts = await api.listAccounts();
    state.students = (accounts.accounts || []).filter((account) => account.role === "student" && account.banned !== true);
  } catch {
    state.students = [];
  }

  bindEvents();
  render();
  startClock();
  watchContestPatch(contestId, (patch) => {
    if (!Array.isArray(patch.energy)) return;
    state.current.energy = mergeEnergyLedger(state.current.energy, patch.energy);
    noteServerTime(patch.serverNow);
    paintClock();
  });
}

function bindEvents() {
  document.querySelector("#contest-name-input")?.addEventListener("input", () => {
    const name = document.querySelector("#contest-name-input").value.trim();
    if (!name || name.length > 60) return;
    state.current.name = name;
    document.querySelector("#contest-title").textContent = name;
    persistContests();
  });
  document.querySelector("#contest-map-add-button")?.addEventListener("click", addContestMap);
  document.querySelector("#contest-map-list")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-map]");
    if (!btn) return;
    removeContestMap(btn.dataset.removeMap);
  });
  document.querySelector("#teleport-connect")?.addEventListener("click", connectTeleports);
  document.querySelector("#teleport-pairs")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-teleport]");
    if (!btn) return;
    state.current.teleports = (state.current.teleports || []).filter((pair) => pair.id !== btn.dataset.removeTeleport);
    render();
    persistContests();
  });
  for (const id of ["#contest-start-input", "#contest-duration-input", "#contest-spawn-input", "#contest-ready-input"]) {
    document.querySelector(id)?.addEventListener("change", commitSchedule);
  }
  for (const id of ["#energy-regen", "#energy-regen-seconds", "#energy-attempt-cost", "#energy-attempt-min", "#energy-solve-below", "#energy-solve-easy", "#energy-solve-normal", "#energy-solve-hard", "#energy-solve-insane"]) {
    document.querySelector(id)?.addEventListener("change", commitEnergy);
  }
  document.querySelector("#delete-open-contest")?.addEventListener("click", deleteContest);
  document.querySelector("#team-form")?.addEventListener("submit", saveTeam);
  document.querySelector("#team-cancel-edit")?.addEventListener("click", resetTeamForm);
  document.querySelector("#team-members")?.addEventListener("input", fillContestantPicker);
  document.querySelector("#team-member-pick")?.addEventListener("change", addPickedContestant);
  document.querySelector("#contestant-list")?.addEventListener("click", onTeamListClick);
  document.querySelector("#contest-spawn-mode")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-spawn-mode]");
    if (!btn) return;
    const spawnMode = btn.dataset.spawnMode === "random" ? "random" : "choose";
    if ((state.current.spawnMode === "random" ? "random" : "choose") === spawnMode) return;
    state.current.spawnMode = spawnMode;
    if (spawnMode === "random") {
      state.current.spawnMinutes = 0;
      const input = document.querySelector("#contest-spawn-input");
      if (input) input.value = "0";
    }
    state.current.spawns = [];
    state.current.spawnChoices = [];
    state.current.spawnVotes = [];
    state.current.claims = [];
    state.current.spawnResolved = false;
    state.current.resolvedTeams = [];
    render();
    persistContests();
  });
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
  fillEnergy();
  updateSpawnNote();
  renderSpawnMode();
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
  fillContestantPicker();
  renderLeaderboard();
  renderBoard();
  paintClock();
}

function contestMaps() {
  return contestMapIds(state.current).map((id) => state.maps.find((map) => map.id === id)).filter(Boolean);
}

function clearBoardState() {
  state.current.spawns = [];
  state.current.spawnChoices = [];
  state.current.spawnVotes = [];
  state.current.claims = [];
  state.current.spawnResolved = false;
  state.current.resolvedTeams = [];
  state.current.energy = [];
}

function setContestMaps(ids) {
  const next = [];
  for (const id of ids) if (id && !next.includes(id)) next.push(id);
  if (!next.length) return;
  const prev = contestMapIds(state.current).slice().sort().join("\0");
  state.current.mapIds = next;
  state.current.mapId = next[0];
  state.current.teleports = (state.current.teleports || []).filter((pair) => next.includes(pair.a.mapId) && next.includes(pair.b.mapId));
  if (prev !== next.slice().sort().join("\0")) clearBoardState();
  state.mapsForContest = contestMaps();
}

async function addContestMap() {
  const id = document.querySelector("#contest-map-add")?.value;
  if (!id || contestMapIds(state.current).includes(id)) return;
  if (!state.maps.some((map) => map.id === id)) {
    try {
      const data = await loadPage("page-map", { map: id });
      state.maps.push(data.map);
      for (const problem of data.problems || []) {
        if (!state.problems.some((item) => item.index === problem.index && item.type === problem.type)) state.problems.push(problem);
      }
    } catch (err) {
      showPageToast(err.message || "Could not open that map.", "warn");
      return;
    }
  }
  setContestMaps([...contestMapIds(state.current), id]);
  render();
  persistContests();
}

function removeContestMap(id) {
  const ids = contestMapIds(state.current).filter((mapId) => mapId !== id);
  if (!ids.length) {
    showPageToast("A contest needs at least one map.", "warn");
    return;
  }
  setContestMaps(ids);
  render();
  persistContests();
}

function fillMapSelect() {
  const select = document.querySelector("#contest-map-add");
  const list = document.querySelector("#contest-map-list");
  if (!select || !list) return;
  const wanted = isTestingContest() ? "testing" : "official";
  const chosen = new Set(contestMapIds(state.current));
  select.replaceChildren(el("option", null, "Choose a map…"));
  select.firstChild.value = "";
  for (const m of state.catalog) {
    if (chosen.has(m.id)) continue;
    const mode = mapMode(m);
    if (mode !== wanted) continue;
    const opt = el("option", null, `${m.name} · ${m.cols} × ${m.rows}${mode === "testing" ? " · Testing" : ""}`);
    opt.value = m.id;
    select.append(opt);
  }
  list.replaceChildren();
  for (const map of contestMaps()) {
    const item = el("li");
    item.append(el("span", null, `${map.name} · ${map.cols} × ${map.rows}`));
    const remove = el("button", "account-action", "Remove");
    remove.type = "button";
    remove.dataset.removeMap = map.id;
    item.append(remove);
    list.append(item);
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
  const maps = contestMaps();
  if (!maps.length) { note.hidden = true; return; }
  const count = maps.reduce((sum, map) => sum + (map.cells || []).filter((cell) => cell.kind === "spawnpoint").length, 0);
  note.hidden = false;
  note.textContent = count === 0
    ? "These maps have no spawn points yet. Place them on a map."
    : `These maps have ${count} spawn point${count === 1 ? "" : "s"}.`;
}

function fillEnergy() {
  const c = state.current;
  const solve = c.energySolve || {};
  const set = (id, value) => {
    const input = document.querySelector(id);
    if (input) input.value = Number.isInteger(value) ? String(value) : "";
  };
  set("#energy-regen", c.energyRegen);
  set("#energy-regen-seconds", c.energyRegenSeconds);
  set("#energy-attempt-cost", c.energyAttemptCost);
  set("#energy-attempt-min", c.energyAttemptMin);
  set("#energy-solve-below", c.energySolveBelow);
  set("#energy-solve-easy", solve.easy);
  set("#energy-solve-normal", solve.normal);
  set("#energy-solve-hard", solve.hard);
  set("#energy-solve-insane", solve.insane);
}

function readEnergyNumber(id, max, min = 0) {
  const n = Number(document.querySelector(id)?.value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function commitEnergy() {
  const error = document.querySelector("#contest-energy-error");
  const regen = readEnergyNumber("#energy-regen", 100);
  const seconds = readEnergyNumber("#energy-regen-seconds", 86400, 1);
  const cost = readEnergyNumber("#energy-attempt-cost", 100);
  const attemptMin = readEnergyNumber("#energy-attempt-min", 100);
  const solveBelow = readEnergyNumber("#energy-solve-below", 100);
  const easy = readEnergyNumber("#energy-solve-easy", 100);
  const normal = readEnergyNumber("#energy-solve-normal", 100);
  const hard = readEnergyNumber("#energy-solve-hard", 100);
  const insane = readEnergyNumber("#energy-solve-insane", 100);
  if ([regen, seconds, cost, attemptMin, solveBelow, easy, normal, hard, insane].some((n) => n === null)) {
    error.hidden = false;
    error.textContent = "Energy values must be whole numbers. Restore amounts are 0 to 100, and the clock interval is 1 to 86400 seconds.";
    return;
  }
  error.hidden = true;
  const c = state.current;
  c.energyRegen = regen;
  c.energyRegenSeconds = seconds;
  c.energyAttemptCost = cost;
  c.energyAttemptMin = attemptMin;
  c.energySolveBelow = solveBelow;
  c.energySolve = { easy, normal, hard, insane };
  persistContests();
}

function renderSpawnMode() {
  const random = state.current.spawnMode === "random";
  for (const btn of document.querySelectorAll("[data-spawn-mode]")) {
    btn.setAttribute("aria-pressed", String((btn.dataset.spawnMode === "random") === random));
  }
  const field = document.querySelector("#contest-spawn-field");
  const note = document.querySelector("#contest-spawn-mode-note");
  if (field) field.hidden = random;
  if (note) note.hidden = !random;
}

function commitSchedule() {
  const c = state.current;
  const random = c.spawnMode === "random";
  const schedule = readSchedule(
    document.querySelector("#contest-start-input").value,
    document.querySelector("#contest-duration-input").value,
    random ? "0" : document.querySelector("#contest-spawn-input").value,
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
    const detail = el("span", "team-detail");
    const energy = el("span", null, "");
    energy.dataset.teamEnergy = team.id;
    detail.append(
      document.createTextNode(`${team.members.length} member${team.members.length === 1 ? "" : "s"} · ${team.members.join(" · ")} · Energy `),
      energy
    );
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

function memberLines() {
  return document.querySelector("#team-members").value
    .split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function fillContestantPicker() {
  const select = document.querySelector("#team-member-pick");
  if (!select) return;
  const listed = new Set(memberLines().map((item) => item.toLowerCase()));
  const taken = new Set();
  for (const team of state.current?.teams || []) {
    if (team.id === state.editingTeamId) continue;
    for (const member of team.members || []) taken.add(String(member).toLowerCase());
  }
  const students = state.students.slice().sort((a, b) =>
    String(a.displayName || a.username).localeCompare(String(b.displayName || b.username)));
  const full = memberLines().length >= 5;
  const openNames = [];
  if (!full) {
    for (const student of students) {
      const key = String(student.username).toLowerCase();
      if (listed.has(key) || taken.has(key)) continue;
      openNames.push(student.username);
    }
  }
  const signature = `${full ? "full" : students.length ? "choose" : "none"}\n${openNames.join("\n")}`;
  if (select.dataset.signature === signature) return;
  select.dataset.signature = signature;
  select.replaceChildren();
  const placeholder = el("option", null, full
    ? "This team already has 5 members"
    : students.length ? "Choose a student…" : "No student accounts");
  placeholder.value = "";
  select.append(placeholder);
  if (full) return;
  let open = 0;
  for (const student of students) {
    const key = String(student.username).toLowerCase();
    if (listed.has(key) || taken.has(key)) continue;
    const option = el("option", null,
      student.displayName && student.displayName.toLowerCase() !== key
        ? `${student.displayName} (${student.username})`
        : student.username);
    option.value = student.username;
    select.append(option);
    open += 1;
  }
  if (students.length && open === 0) placeholder.textContent = "Every student is already on a team";
}

function addPickedContestant() {
  const select = document.querySelector("#team-member-pick");
  const username = select.value;
  if (!username) return;
  const members = memberLines();
  if (members.length >= 5) {
    select.value = "";
    showPageToast("A team can have at most 5 members.", "warn");
    fillContestantPicker();
    return;
  }
  if (!members.some((member) => member.toLowerCase() === username.toLowerCase())) {
    members.push(username);
    document.querySelector("#team-members").value = members.join("\n");
  }
  fillContestantPicker();
}

function beginEdit(team) {
  state.editingTeamId = team.id;
  document.querySelector("#team-name").value = team.name;
  document.querySelector("#team-members").value = team.members.join("\n");
  document.querySelector("#team-submit").textContent = "Save team";
  document.querySelector("#team-cancel-edit").hidden = false;
  document.querySelector("#team-edit-note").hidden = false;
  document.querySelector("#team-edit-note").textContent = "Editing an existing team. Removed members lose their spawn pick.";
  fillContestantPicker();
}

function resetTeamForm() {
  state.editingTeamId = null;
  document.querySelector("#team-name").value = "";
  document.querySelector("#team-members").value = "";
  document.querySelector("#team-submit").textContent = "Add team";
  document.querySelector("#team-cancel-edit").hidden = true;
  document.querySelector("#team-edit-note").hidden = true;
  document.querySelector("#team-form-error").hidden = true;
  fillContestantPicker();
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
  if (Array.isArray(next.energy)) state.current.energy = next.energy;
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
  const maps = contestMaps();
  const spawns = contest.spawnResolved ? (contest.spawns || []) : [];
  return (contest.teams || []).map((team) => {
    let score = 0, solved = 0;
    let territory = spawns.some((s) => s.teamId === team.id) ? 1 : 0;
    for (const claim of contest.claims || []) {
      if (claim.teamId !== team.id) continue;
      territory += 1;
      const map = maps.find((item) => item.id === (claim.mapId || primaryMapId(contest)));
      const cell = map?.cells?.[claim.cell];
      if (!cell || cell.kind !== "problem") continue;
      const p = state.problems.find((x) => x.index === cell.problemNo && x.type === cell.type);
      score += problemScore(p);
      solved += 1;
    }
    return { teamId: team.id, name: team.name, score, solved, territory };
  }).sort((a, b) => b.score - a.score || b.solved - a.solved || a.name.localeCompare(b.name));
}

function renderBoard() {
  const boards = document.querySelector("#contest-boards");
  if (!boards) return;
  const maps = contestMaps();
  boards.replaceChildren();
  if (!maps.length) return;
  const contest = isTestingContest() ? contestAsTeam(state.current, state.adminViewTeamId) : state.current;
  for (const map of maps) {
    const block = el("section", "contest-map-block");
    block.append(el("h3", null, map.name));
    const scroll = el("div", "grid-scroll");
    const grid = el("div", "editor-grid");
    grid.dataset.cols = String(map.cols);
    grid.dataset.rows = String(map.rows);
    layoutMapGrid(grid, map.cols, map.rows);
    map.cells.forEach((cell, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.index = String(index);
      button.dataset.map = map.id;
      button.className = cellClassName(cell, findBoardProblem, "grid-cell");
      const label = teleportLabel(state.current, map.id, index);
      if (!(mapBackdrop(map) === "photo" && cell?.kind === "problem")) fillCellLabel(button, cell, label);
      const owner = ownerAt(contest, map.id, index, cell);
      if (owner) {
        button.classList.add("owned");
        const color = teamColor(state.current, owner.id);
        button.style.setProperty("--team", color);
        const mark = el("span", "cell-owner", teamShort(owner.name));
        mark.title = owner.name;
        mark.style.color = color;
        button.append(mark);
      }
      button.disabled = true;
      grid.append(button);
    });
    paintPhotoGrid(grid, map, findBoardProblem);
    scroll.append(grid);
    block.append(scroll);
    boards.append(block);
  }
  drawTeleportLinks(boards, state.current?.teleports);
  renderTeleports();
}

function teleportChoices() {
  const used = new Set();
  for (const pair of state.current.teleports || []) {
    used.add(placeKey(pair.a.mapId, pair.a.cell));
    used.add(placeKey(pair.b.mapId, pair.b.cell));
  }
  const choices = [];
  for (const map of contestMaps()) {
    map.cells.forEach((cell, index) => {
      if (cell?.kind !== "teleport" || used.has(placeKey(map.id, index))) return;
      const row = Math.floor(index / map.cols) + 1;
      const column = (index % map.cols) + 1;
      choices.push({ mapId: map.id, cell: index, label: `${map.name} · row ${row}, column ${column}` });
    });
  }
  return choices;
}

function renderTeleports() {
  const from = document.querySelector("#teleport-from");
  const to = document.querySelector("#teleport-to");
  const list = document.querySelector("#teleport-pairs");
  const empty = document.querySelector("#teleport-empty");
  if (!from || !to || !list || !empty) return;
  const choices = teleportChoices();
  const fill = (select) => {
    const current = select.value;
    select.replaceChildren(el("option", null, "Choose a teleport…"));
    select.firstChild.value = "";
    for (const choice of choices) {
      const opt = el("option", null, choice.label);
      opt.value = placeKey(choice.mapId, choice.cell);
      select.append(opt);
    }
    if ([...select.options].some((opt) => opt.value === current)) select.value = current;
  };
  fill(from);
  fill(to);
  const pairs = state.current.teleports || [];
  empty.hidden = pairs.length > 0;
  list.hidden = pairs.length === 0;
  list.replaceChildren();
  for (const pair of pairs) {
    const item = el("li");
    item.append(el("span", null, `${pair.label}: ${placeText(pair.a)} ↔ ${placeText(pair.b)}`));
    const remove = el("button", "account-action", "Disconnect");
    remove.type = "button";
    remove.dataset.removeTeleport = pair.id;
    item.append(remove);
    list.append(item);
  }
}

function placeText(place) {
  const map = state.maps.find((item) => item.id === place.mapId);
  if (!map) return "Missing map";
  return `${map.name} · row ${Math.floor(place.cell / map.cols) + 1}, column ${(place.cell % map.cols) + 1}`;
}

function connectTeleports() {
  const from = document.querySelector("#teleport-from")?.value;
  const to = document.querySelector("#teleport-to")?.value;
  if (!from || !to || from === to) {
    showPageToast("Choose two different teleport cells.", "warn");
    return;
  }
  const choices = teleportChoices();
  const a = choices.find((choice) => placeKey(choice.mapId, choice.cell) === from);
  const b = choices.find((choice) => placeKey(choice.mapId, choice.cell) === to);
  if (!a || !b) {
    showPageToast("Those teleport cells are already connected.", "warn");
    return;
  }
  const pairs = state.current.teleports || [];
  pairs.push({
    id: `tp-${Date.now().toString(36)}`,
    label: nextTeleportLabel(pairs),
    a: { mapId: a.mapId, cell: a.cell },
    b: { mapId: b.mapId, cell: b.cell },
  });
  state.current.teleports = pairs;
  render();
  persistContests();
}

function findBoardProblem(index, type) {
  return state.problems.find((p) => p.index === index && p.type === type) || null;
}

function ownerAt(contest, mapId, index, cell) {
  const claim = (contest.claims || []).find((c) => (c.mapId || primaryMapId(contest)) === mapId && c.cell === index);
  if (claim) return (contest.teams || []).find((t) => t.id === claim.teamId) || null;
  if (cell?.kind !== "spawnpoint" || !contest.spawnResolved) return null;
  const spawn = (contest.spawns || []).find((s) => (s.mapId || primaryMapId(contest)) === mapId && s.cell === index);
  return spawn ? (contest.teams || []).find((t) => t.id === spawn.teamId) || null : null;
}

function paintClock() {
  const node = document.querySelector("#contest-countdown");
  if (!node) return;
  const text = phaseClock(state.current);
  node.hidden = !text;
  node.textContent = text;
  for (const energy of document.querySelectorAll("[data-team-energy]")) {
    energy.textContent = `${teamEnergy(state.current, energy.dataset.teamEnergy)}/100`;
  }
}

function startClock() {
  if (state.clock) return;
  state.clock = setInterval(() => {
    if (!document.querySelector("#contest-boards")) {
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
  try {
    await api.deleteContest(state.current.id, state.revisions.contests);
    location.assign("/admin/contests.html");
  } catch (err) {
    showPageToast(err.message, "warn");
  }
}

async function persistContests() {
  try {
    const data = await api.saveContest(state.current, state.revisions.contests);
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