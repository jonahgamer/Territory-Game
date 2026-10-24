import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { el } from "../shared/dom.js";
import { MIN_PROBLEM_NO, MAX_PROBLEM_NO, YEAR_INDEX_START, YEAR_INDEX_END } from "../shared/constants.js";
import { typeInfo, problemDifficulty, problemTag } from "../shared/difficulty.js";
import { layoutMapGrid, mapMode, mapBackdrop, cellClassName, fillCellLabel, cellLabel, renderMapCounts, paintPhotoGrid, readMapPhoto } from "../shared/map-render.js?v=mem";
import { isSaveConflictActive, openSaveConflict } from "../shared/conflict.js?v=page-data";

// ── 顶层常量 ─────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const mapId = params.get("map");

const mapEl = document.querySelector("#editor-grid");
const titleEl = document.querySelector("#editor-title");
const sizeEl = document.querySelector("#editor-size");
const countsEl = document.querySelector("#map-counts");
const nameInput = document.querySelector("#map-name-input");
const saveButton = document.querySelector("#save-map-button");
const deleteButton = document.querySelector("#delete-open-map");

// ── 状态 ─────────────────────────────────────────────────
const state = {
  maps: [], problems: [], reserved: [], revisions: { maps: 0, problems: 0 },
  current: null, dirty: false,
  paintKind: "problem",
  placeType: "math",
  placeMode: "manual",
  placePickSource: "random",
  placePickTypes: new Set(["math"]),
  placePickDifficulties: new Set(["easy", "normal", "hard", "insane"]),
};

// ── 函数 ─────────────────────────────────────────────────
async function run() {
  if (!mapId) throw new Error("No map selected.");
  const data = await loadPage("page-map", { map: mapId });
  state.current = data.map;
  state.maps = [data.map];
  state.problems = data.problems;
  state.reserved = data.reserved || [];
  state.revisions = data.revisions;
  if (!state.current) throw new Error("That map was not found.");

  nameInput.value = state.current.name;
  titleEl.textContent = state.current.name;
  sizeEl.textContent = `${state.current.cols} × ${state.current.rows}`;
  renderMapCounts(countsEl, state.current);
  renderMode();
  renderBackdrop();
  chooseTool("problem");
  renderGrid();
  if (state.current.mode === "testing") {
    document.querySelectorAll("[data-place-type='testing'], [data-pick-type='testing']").forEach((b) => { b.hidden = false; });
  }
  bindEvents();
  updateSaveButton();
}

function bindEvents() {
  document.querySelector("#kind-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-tool]");
    if (btn) chooseTool(btn.dataset.tool);
  });
  document.querySelector("#map-backdrop-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-backdrop]");
    if (!btn || !state.current) return;
    const next = btn.dataset.backdrop === "photo" ? "photo" : "terrain";
    if (next === "terrain") {
      if (mapBackdrop(state.current) === "terrain" && !state.current.photo) return;
      state.current.backdrop = "terrain";
      state.current.photo = "";
      markDirty();
      renderBackdrop();
      renderGrid();
      return;
    }
    document.querySelector("#map-photo-input")?.click();
  });
  document.querySelector("#map-photo-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !state.current) return;
    try {
      state.current.photo = await readMapPhoto(file);
      state.current.backdrop = "photo";
      markDirty();
      renderBackdrop();
      renderGrid();
    } catch (error) {
      showPageToast(error.message || "That photo could not be used.", "warn");
    }
  });
  document.querySelector("#map-mode-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-map-mode]");
    if (!btn) return;
    const mode = btn.dataset.mapMode === "testing" ? "testing" : "official";
    if (mapMode(state.current) === mode) return;
    if (mode === "official" && (state.current.cells || []).some((c) => c?.kind === "problem" && c.type === "testing")) {
      showPageToast("Remove Testing problems before making this map official.", "warn");
      return;
    }
    state.current.mode = mode;
    markDirty();
    renderMode();
    syncPlaceType();
  });
  document.querySelector("#place-mode-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-place-mode]");
    if (!btn) return;
    state.placeMode = btn.dataset.placeMode === "pick" ? "pick" : "manual";
    renderPlaceMode();
  });
  document.querySelector("#place-type-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-place-type]");
    if (!btn || !typeInfo(btn.dataset.placeType)) return;
    if (btn.dataset.placeType === "testing" && mapMode(state.current) !== "testing") return;
    state.placeType = btn.dataset.placeType;
    syncPlaceType();
    const nextInput = document.querySelector("#problem-no");
    if (nextInput && document.querySelector("#next-number")?.checked) {
      nextInput.value = String(nextProblemNo(state.placeType) ?? "");
    }
  });
  document.querySelector("#place-pick-types")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-pick-type]");
    if (!btn || !typeInfo(btn.dataset.pickType)) return;
    if (btn.dataset.pickType === "testing" && mapMode(state.current) !== "testing") return;
    if (state.placePickTypes.has(btn.dataset.pickType)) state.placePickTypes.delete(btn.dataset.pickType);
    else state.placePickTypes.add(btn.dataset.pickType);
    renderPlaceMode();
  });
  document.querySelector("#place-pick-difficulties")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-pick-difficulty]");
    const d = btn?.dataset.pickDifficulty;
    if (!btn || !["easy", "normal", "hard", "insane"].includes(d)) return;
    if (state.placePickDifficulties.has(d)) state.placePickDifficulties.delete(d);
    else state.placePickDifficulties.add(d);
    renderPlaceMode();
  });
  document.querySelector("#place-pick-source")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-pick-source]");
    const s = btn?.dataset.pickSource;
    if (!btn || !["random", "fixed", "range"].includes(s)) return;
    state.placePickSource = s;
    renderPlaceMode();
  });
  nameInput?.addEventListener("input", () => {
    const name = nameInput.value.trim();
    if (!name || name.length > 60) return;
    state.current.name = name;
    titleEl.textContent = name;
    markDirty();
  });
  saveButton?.addEventListener("click", save);
  deleteButton?.addEventListener("click", deleteMap);
  mapEl?.addEventListener("pointerdown", startPaint);
}

function chooseTool(kind) {
  state.paintKind = kind;
  for (const btn of document.querySelectorAll("[data-tool]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.tool === kind));
  }
  const opts = document.querySelector("#problem-options");
  if (opts) opts.hidden = kind !== "problem";
}

function renderMode() {
  for (const btn of document.querySelectorAll("[data-map-mode]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.mapMode === mapMode(state.current)));
  }
  if (mapEl) mapEl.dataset.mapMode = mapMode(state.current);
  syncPlaceType();
}

function syncPlaceType() {
  const testingMap = mapMode(state.current) === "testing";
  for (const btn of document.querySelectorAll("[data-place-type='testing'], [data-pick-type='testing']")) {
    btn.hidden = !testingMap;
  }
  if (!testingMap) {
    state.placePickTypes.delete("testing");
    if (state.placeType === "testing") state.placeType = "math";
  }
  for (const btn of document.querySelectorAll("[data-place-type]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.placeType === state.placeType));
  }
  renderPlaceMode();
}

function renderPlaceMode() {
  for (const btn of document.querySelectorAll("[data-place-mode]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.placeMode === state.placeMode));
  }
  document.querySelector("#place-manual").hidden = state.placeMode !== "manual";
  document.querySelector("#place-pick").hidden = state.placeMode !== "pick";
  for (const btn of document.querySelectorAll("[data-pick-type]")) {
    btn.setAttribute("aria-pressed", String(state.placePickTypes.has(btn.dataset.pickType)));
  }
  for (const btn of document.querySelectorAll("[data-pick-difficulty]")) {
    btn.setAttribute("aria-pressed", String(state.placePickDifficulties.has(btn.dataset.pickDifficulty)));
  }
  for (const btn of document.querySelectorAll("[data-pick-source]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.pickSource === state.placePickSource));
  }
  document.querySelector("#place-fixed-field").hidden = state.placePickSource !== "fixed";
  document.querySelector("#place-range-field").hidden = state.placePickSource !== "range";
}

function renderBackdrop() {
  const photo = mapBackdrop(state.current) === "photo";
  for (const btn of document.querySelectorAll("[data-backdrop]")) {
    btn.setAttribute("aria-pressed", String((btn.dataset.backdrop === "photo") === photo));
  }
  const field = document.querySelector("#map-photo-field");
  if (field) field.hidden = !photo;
}

function applyCellFace(button, cell) {
  if (mapBackdrop(state.current) === "photo" && cell?.kind === "problem") {
    button.replaceChildren();
    return;
  }
  fillCellLabel(button, cell);
}

function renderGrid() {
  const map = state.current;
  mapEl.dataset.cols = String(map.cols);
  mapEl.dataset.rows = String(map.rows);
  layoutMapGrid(mapEl, map.cols, map.rows);
  mapEl.replaceChildren();
  map.cells.forEach((cell, index) => {
    if (!cell) return;
    const row = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;
    const button = el("button", cellClassName(cell, findProblem, "grid-cell"));
    applyCellFace(button, cell);
    button.type = "button";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", cellLabel(cell, row, column));
    mapEl.append(button);
  });
  paintPhotoGrid(mapEl, map, findProblem);
  renderMapCounts(countsEl, map);
}

function findProblem(index, type) {
  return state.problems.find((p) => p.index === index && p.type === type) || null;
}

function paintCell(index) {
  const map = state.current;
  const button = mapEl.querySelector(`[data-index="${index}"]`);
  if (!button) return;
  const cell = map.cells[index];
  const row = Math.floor(index / map.cols) + 1;
  const column = (index % map.cols) + 1;
  button.className = cellClassName(cell, findProblem, "grid-cell");
  applyCellFace(button, cell);
  button.setAttribute("aria-label", cellLabel(cell, row, column));
  paintPhotoGrid(mapEl, map, findProblem);
  renderMapCounts(countsEl, map);
}

function markDirty() { state.dirty = true; updateSaveButton(); }
function updateSaveButton() { if (saveButton) saveButton.disabled = !state.dirty; }

function nextProblemNo(type) {
  const used = new Set();
  for (const p of state.problems) if (p.type === type) used.add(p.index);
  for (const item of state.reserved) if (item.type === type) used.add(item.index);
  for (const m of state.maps) {
    for (const c of m.cells || []) {
      if (c?.kind === "problem" && c.type === type) used.add(c.problemNo);
    }
  }
  for (let i = YEAR_INDEX_START; i <= YEAR_INDEX_END; i += 1) {
    if (!used.has(i)) return i;
  }
  return null;
}

function readProblemNo(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_PROBLEM_NO || n > MAX_PROBLEM_NO) return null;
  return n;
}

function pickProblemForMap(map) {
  if (state.placePickTypes.size === 0 || state.placePickDifficulties.size === 0) {
    return { error: "Choose at least one type and one difficulty." };
  }
  if (mapMode(map) !== "testing" && [...state.placePickTypes].every((t) => t === "testing")) {
    return { error: "Testing problems can only be placed on a testing map." };
  }
  let pool = state.problems.filter((p) =>
    state.placePickTypes.has(p.type) && state.placePickDifficulties.has(problemDifficulty(p)));
  if (mapMode(map) !== "testing") pool = pool.filter((p) => p.type !== "testing");
  if (state.placePickSource === "fixed") {
    const index = readProblemNo(document.querySelector("#place-fixed-index")?.value);
    if (index === null) return { error: `Index must be ${MIN_PROBLEM_NO}–${MAX_PROBLEM_NO}.` };
    pool = pool.filter((p) => p.index === index);
  } else if (state.placePickSource === "range") {
    const from = readProblemNo(document.querySelector("#place-range-from")?.value);
    const to = readProblemNo(document.querySelector("#place-range-to")?.value);
    if (from === null || to === null) return { error: `Range must use ${MIN_PROBLEM_NO}–${MAX_PROBLEM_NO}.` };
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    pool = pool.filter((p) => p.index >= low && p.index <= high);
  }
  if (pool.length === 0) return { error: "No saved problem matches those filters." };
  const uses = new Map();
  for (const c of map.cells || []) {
    if (c.kind !== "problem") continue;
    const key = `${c.type}:${c.problemNo}`;
    uses.set(key, (uses.get(key) || 0) + 1);
  }
  const countOf = (p) => uses.get(`${p.type}:${p.index}`) || 0;
  const unused = pool.filter((p) => countOf(p) === 0);
  const source = unused.length > 0 ? unused : pool;
  let lowest = Infinity;
  for (const p of source) lowest = Math.min(lowest, countOf(p));
  const tied = source.filter((p) => countOf(p) === lowest);
  const chosen = tied[Math.floor(Math.random() * tied.length)];
  return { type: chosen.type, index: chosen.index };
}

let painting = false;
let paintedThisStroke = new Set();
let strokeCount = 0;
let pendingProblemOpen = null;

function startPaint(event) {
  const cell = event.target.closest?.("[data-index]");
  if (!cell) return;
  const index = Number(cell.dataset.index);
  if (!Number.isInteger(index)) return;
  if (window.matchMedia("(pointer: coarse)").matches && event.pointerType === "touch") return;
  event.preventDefault();
  painting = true;
  strokeCount = 0;
  pendingProblemOpen = null;
  paintedThisStroke = new Set();
  window.addEventListener("pointermove", continuePaint);
  window.addEventListener("pointerup", stopPaint);
  window.addEventListener("pointercancel", stopPaint);
  applyTool(index, "toggle");
}

function continuePaint(event) {
  if (!painting) return;
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const cell = element?.closest?.("[data-index]");
  if (!cell || !mapEl.contains(cell)) return;
  applyTool(Number(cell.dataset.index), "toggle");
}

function stopPaint() {
  if (!painting) return;
  const openNo = strokeCount === 1 ? pendingProblemOpen : null;
  painting = false;
  strokeCount = 0;
  pendingProblemOpen = null;
  paintedThisStroke = new Set();
  window.removeEventListener("pointermove", continuePaint);
  window.removeEventListener("pointerup", stopPaint);
  window.removeEventListener("pointercancel", stopPaint);
  if (openNo) {
    save().then((ok) => {
      if (ok) location.assign(`/admin/problem-editor.html?type=${encodeURIComponent(openNo.type)}&index=${openNo.index}&from=map&map=${encodeURIComponent(state.current.id)}`);
    });
  }
}

function applyTool(index, mode) {
  if (paintedThisStroke.has(index)) return;
  const map = state.current;
  const cell = map.cells[index];
  if (!cell) return;

  if (state.paintKind === "problem" && cell.kind === "problem") {
    paintedThisStroke.add(index);
    strokeCount += 1;
    pendingProblemOpen = { index: cell.problemNo, type: cell.type };
    return;
  }
  if (mode === "toggle" && cell.kind !== "empty") {
    paintedThisStroke.add(index);
    strokeCount += 1;
    map.cells[index] = { kind: "empty" };
    paintCell(index);
    markDirty();
    return;
  }
  if (state.paintKind === "problem") {
    const picked = state.placeMode === "pick" ? pickProblemForMap(map) : null;
    const problemNo = state.placeMode === "pick" ? picked?.index : readProblemNo(document.querySelector("#problem-no")?.value);
    const type = state.placeMode === "pick" ? picked?.type : state.placeType;
    const errorEl = document.querySelector("#problem-no-error");
    if (type === "testing" && mapMode(map) !== "testing") {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = "Testing problems can only be placed on a testing map."; }
      stopPaint();
      return;
    }
    if (state.placeMode === "pick" && picked?.error) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = picked.error; }
      stopPaint();
      return;
    }
    if (problemNo === null || !type) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = `Problem no. must be ${MIN_PROBLEM_NO}–${MAX_PROBLEM_NO}.`; }
      stopPaint();
      return;
    }
    if (errorEl) errorEl.hidden = true;
    paintedThisStroke.add(index);
    strokeCount += 1;
    map.cells[index] = { kind: "problem", problemNo, type };
    paintCell(index);
    markDirty();
    if (state.placeMode !== "pick" && document.querySelector("#next-number")?.checked && problemNo < MAX_PROBLEM_NO) {
      const nextInput = document.querySelector("#problem-no");
      if (nextInput) nextInput.value = String(problemNo + 1);
    }
    return;
  }
  paintedThisStroke.add(index);
  strokeCount += 1;
  if (state.paintKind === "spawnpoint") map.cells[index] = { kind: "spawnpoint" };
  else if (state.paintKind === "obstacle") map.cells[index] = { kind: "obstacle" };
  else if (state.paintKind === "teleport") map.cells[index] = { kind: "teleport" };
  else map.cells[index] = { kind: "empty" };
  paintCell(index);
  markDirty();
}

async function save() {
  if (!state.dirty || isSaveConflictActive()) return false;
  try {
    const data = await api.saveMap(state.current, state.revisions.maps);
    state.revisions.maps = data.revision;
    state.dirty = false;
    updateSaveButton();
    showPageToast("Map saved.", "ok");
    return true;
  } catch (err) {
    if (err.status === 409) {
      openSaveConflict({
        collection: "maps",
        api,
        loadRemote: async () => {
          const latest = await loadPage("page-map", { map: mapId });
          return { items: [latest.map], revision: latest.revisions.maps };
        },
        getLocal: () => [state.current],
        setLocal: (v) => {
          state.current = v.find((m) => m.id === mapId) || v[0] || null;
          state.maps = state.current ? [state.current] : [];
        },
        getRevision: () => state.revisions.maps,
        setRevision: (v) => { state.revisions.maps = v; },
        focusKeys: () => new Set([mapId]),
        refreshAfter: () => {
          if (!state.current) { location.assign("/admin/maps.html"); return; }
          state.dirty = false;
          updateSaveButton();
          titleEl.textContent = state.current.name;
          nameInput.value = state.current.name;
          renderBackdrop();
          renderGrid();
        },
        persist: async () => {
          const d = await api.saveMap(state.current, state.revisions.maps);
          state.revisions.maps = d.revision;
          state.dirty = false;
          updateSaveButton();
          return true;
        },
      });
      return false;
    }
    showPageToast(err.message || "Could not save.", "warn");
    return false;
  }
}

async function deleteMap() {
  if (!state.current) return;
  const name = state.current.name;
  if (!window.confirm(`Delete the map ${name}?`) || !window.confirm(`Delete ${name} now?`)) return;
  try {
    await api.deleteMap(state.current.id, state.revisions.maps);
    location.assign("/admin/maps.html");
  } catch (err) {
    showPageToast(err.message || "Could not delete the map.", "warn");
  }
}

// ── 启动（最后） ─────────────────────────────────────────
if (requireAdmin()) {
  initNav("maps");
  bindToastClose();
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message || "Could not open the map."; }
  });
}