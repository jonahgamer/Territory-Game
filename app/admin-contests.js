import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { el, renderList } from "../shared/dom.js";
import { formatContestTime, readSchedule } from "../shared/contest-time.js";
import { mapMode } from "../shared/map-render.js";

// ── 状态 ─────────────────────────────────────────────────
const state = {
  contests: [],
  maps: [],
  revisions: { contests: 0 },
  mode: "competition",
  spawnMode: "choose",
};

// ── 数据加载 ─────────────────────────────────────────────
async function run() {
  try {
    const data = await loadPage("page-contests");
    state.contests = data.contests;
    state.maps = data.maps;
    state.revisions = data.revisions;
  } catch (err) {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message; }
    return;
  }
  render();
  bindEvents();
}

// ── 事件绑定 ─────────────────────────────────────────────
function bindEvents() {
  document.querySelector("#create-contest-mode")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-contest-mode]");
    if (!btn) return;
    state.mode = btn.dataset.contestMode === "testing" ? "testing" : "competition";
    renderMode();
    renderMapSelect();
  });

  document.querySelector("#create-spawn-mode")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-spawn-mode]");
    if (!btn) return;
    state.spawnMode = btn.dataset.spawnMode === "random" ? "random" : "choose";
    renderSpawnMode();
  });
  document.querySelector("#create-contest-form")?.addEventListener("submit", createContest);
  document.querySelector("#contest-map")?.addEventListener("change", () => {
    updateSpawnNote(document.querySelector("#contest-map"), document.querySelector("#contest-map-note"));
  });
}

// ── 渲染 ─────────────────────────────────────────────────
function renderSpawnMode() {
  const random = state.spawnMode === "random";
  for (const btn of document.querySelectorAll("#create-spawn-mode [data-spawn-mode]")) {
    btn.setAttribute("aria-pressed", String((btn.dataset.spawnMode === "random") === random));
  }
  const field = document.querySelector("#create-spawn-field");
  const note = document.querySelector("#create-spawn-note");
  const input = document.querySelector("#contest-spawn");
  if (field) field.hidden = random;
  if (note) note.hidden = !random;
  if (input) input.required = !random;
}

function renderMode() {
  for (const btn of document.querySelectorAll("[data-contest-mode]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.contestMode === state.mode));
  }
}

function renderMapSelect() {
  const select = document.querySelector("#contest-map");
  if (!select) return;
  const wanted = state.mode === "testing" ? "testing" : "official";
  const choices = state.maps.filter((m) => mapMode(m) === wanted);
  select.replaceChildren();
  if (choices.length === 0) {
    const opt = el("option", null, wanted === "testing" ? "No testing maps yet" : "No official maps yet");
    opt.value = "";
    select.append(opt);
  } else {
    for (const m of choices) {
      const opt = el("option", null, `${m.name} · ${m.cols} × ${m.rows}`);
      opt.value = m.id;
      select.append(opt);
    }
  }
  updateSpawnNote(select, document.querySelector("#contest-map-note"));
}

function updateSpawnNote(select, note) {
  if (!select || !note) return;
  const map = state.maps.find((m) => m.id === select.value);
  if (!map) { note.hidden = true; return; }
  const count = Number.isInteger(map.spawnPoints) ? map.spawnPoints : (map.cells || []).filter((c) => c.kind === "spawnpoint").length;
  note.hidden = false;
  note.textContent = count === 0
    ? `${map.name} has no spawn points yet. Place them on the map.`
    : `${map.name} has ${count} spawn point${count === 1 ? "" : "s"}.`;
}

function render() {
  renderMode();
  renderMapSelect();
  const list = document.querySelector("#contest-list");
  const empty = document.querySelector("#contest-empty");
  
  if (!list || !empty) return;
  
  empty.hidden = state.contests.length > 0;
  list.hidden = state.contests.length === 0;

  renderList(list, state.contests, (contest) => {
    const map = state.maps.find((m) => m.id === contest.mapId);
    const item = el("li");
    const button = el("button", "open-problem");
    button.type = "button";
    const name = el("span", "contest-name-label", contest.name);
    const detail = el("span", "problem-snippet",
      `${map ? map.name : "Map removed"} · ${contest.startAt ? formatContestTime(contest.startAt) : "Schedule not set"}`);
    
    button.append(name, detail);
    button.addEventListener("click", () => {
      location.assign(`/admin/contest.html?id=${encodeURIComponent(contest.id)}`);
    });
    item.append(button);
    return item;
  });
}

// ── 操作 ─────────────────────────────────────────────────
async function createContest(event) {
  event.preventDefault();
  const name = document.querySelector("#contest-name").value.trim();
  const mapId = document.querySelector("#contest-map").value;
  const formError = document.querySelector("#contest-form-error");

  if (!name || name.length > 60) { formError.hidden = false; formError.textContent = "Give the contest a name."; return; }
  if (!mapId || !state.maps.some((m) => m.id === mapId)) { formError.hidden = false; formError.textContent = "Choose a map."; return; }

  const random = state.spawnMode === "random";
  const schedule = readSchedule(
    document.querySelector("#contest-start").value,
    document.querySelector("#contest-duration").value,
    random ? "0" : document.querySelector("#contest-spawn").value,
    document.querySelector("#contest-ready").value
  );
  if (schedule.error) { formError.hidden = false; formError.textContent = schedule.error; return; }
  formError.hidden = true;

  const newContest = {
    id: crypto.randomUUID(),
    name, mapId,
    contestantIds: [],
    teams: [],
    spawnChoices: [], spawnVotes: [], spawns: [], claims: [],
    spawnResolved: false,
    startAt: schedule.startAt,
    durationMinutes: schedule.durationMinutes,
    spawnMinutes: schedule.spawnMinutes,
    readyMinutes: schedule.readyMinutes,
    mode: state.mode,
    spawnMode: state.spawnMode,
  };
  
  state.contests.unshift(newContest);
  
  try {
    const data = await api.saveContest(newContest, state.revisions.contests);
    state.revisions.contests = data.revision;
    document.querySelector("#contest-name").value = "";
    showPageToast("Contest created.", "ok");
    // 创建成功后直接跳转到详情页
    location.assign(`/admin/contest.html?id=${encodeURIComponent(newContest.id)}`);
  } catch (err) {
    state.contests = state.contests.filter((c) => c.id !== newContest.id);
    formError.hidden = false;
    formError.textContent = err.message || "Could not create contest.";
  }
}

// ── 启动 ─────────────────────────────────────────────────
if (requireAdmin()) {
  initNav("contests");
  bindToastClose();
  run();
}