import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { el } from "../shared/dom.js";
import { MIN_PROBLEM_NO, MAX_PROBLEM_NO, YEAR_INDEX_START, YEAR_INDEX_END, MIN_SIZE, MAX_SIZE, CELL_SIZE } from "../shared/constants.js";
import { typeInfo, problemDifficulty } from "../shared/difficulty.js";
import { layoutMapGrid, mapMode, mapBackdrop, cellClassName, fillCellLabel, cellLabel, renderMapCounts, photoCover, readMapPhoto, resizeMapCells, cellsOutsideResize } from "../shared/map-render.js?v=map-views";
import { DIFFICULTY_LEGEND, difficultyCellPaint, difficultyTierValues, rgbCss } from "../shared/map-difficulty.js?v=map-views";
import { isSaveConflictActive, openSaveConflict } from "../shared/conflict.js?v=page-data";

// ── 顶层常量 ─────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const mapId = params.get("map") || params.get("id");

const mapEl = document.querySelector("#editor-grid");
const titleEl = document.querySelector("#editor-title");
const colsInput = document.querySelector("#map-cols-input");
const rowsInput = document.querySelector("#map-rows-input");
const countsEl = document.querySelector("#map-counts");
const nameInput = document.querySelector("#map-name-input");
const saveButton = document.querySelector("#save-map-button");
const deleteButton = document.querySelector("#delete-open-map");

// ── 状态 ─────────────────────────────────────────────────
const state = {
  maps: [], problems: [], reserved: [], revisions: { maps: 0, problems: 0 },
  current: null, dirty: false,
  view: params.get("view") === "difficulty" ? "difficulty" : "basic",
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
  syncSizeInputs();
  renderMapCounts(countsEl, state.current);
  renderMode();
  renderView();
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
  document.querySelector("#map-view-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-map-view]");
    if (!btn) return;
    state.view = btn.dataset.mapView === "difficulty" ? "difficulty" : "basic";
    const next = new URLSearchParams(location.search);
    next.set("view", state.view);
    history.replaceState(null, "", `${location.pathname}?${next.toString()}`);
    renderView();
    renderGrid();
  });
  document.querySelector("#map-photo-toggle")?.addEventListener("click", () => {
    if (!state.current) return;
    if (mapBackdrop(state.current) === "photo") {
      state.current.backdrop = "terrain";
      markDirty();
      renderView();
      renderGrid();
      return;
    }
    if (!state.current.photo) {
      document.querySelector("#map-photo-input")?.click();
      return;
    }
    state.current.backdrop = "photo";
    markDirty();
    renderView();
    renderGrid();
  });
  document.querySelector("#map-photo-change")?.addEventListener("click", () => {
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
      renderView();
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
  document.querySelector("#apply-map-size")?.addEventListener("click", applySize);
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

function renderView() {
  for (const btn of document.querySelectorAll("[data-map-view]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.mapView === state.view));
  }
  const photoOn = mapBackdrop(state.current) === "photo";
  document.querySelector("#map-photo-toggle")?.setAttribute("aria-pressed", String(photoOn));
  const change = document.querySelector("#map-photo-change");
  if (change) change.hidden = !state.current?.photo;
  const legend = document.querySelector("#difficulty-legend");
  if (!legend) return;
  legend.hidden = state.view !== "difficulty";
  if (state.view !== "difficulty" || legend.childElementCount) return;
  legend.replaceChildren();
  for (const [label, rgb] of DIFFICULTY_LEGEND) {
    const item = document.createElement("span");
    const swatch = document.createElement("span");
    swatch.className = "difficulty-swatch";
    swatch.style.background = rgbCss(rgb);
    item.append(swatch, document.createTextNode(label));
    legend.append(item);
  }
}

let tierValues = [];

function applyCellFace(button, cell, index) {
  button.className = state.view === "difficulty" ? "grid-cell difficulty-cell" : cellClassName(cell, findProblem, "grid-cell");
  button.style.background = "";
  button.style.color = "";
  button.style.textShadow = "";
  const face = document.createElement("span");
  face.className = "cell-face";
  if (state.view === "difficulty") {
    const paint = difficultyCellPaint(state.current, index, cell, tierValues, findProblem);
    button.style.background = paint.background;
    button.style.color = paint.color;
    button.style.textShadow = paint.color === "#111111" ? "none" : "0 1px 2px rgba(0,0,0,0.55)";
    face.textContent = paint.text;
  } else {
    fillCellLabel(face, cell);
  }
  button.replaceChildren(face);
}

function syncSizeInputs() {
  if (!state.current) return;
  if (colsInput) colsInput.value = String(state.current.cols);
  if (rowsInput) rowsInput.value = String(state.current.rows);
}

function readSize(input) {
  const value = Number(input?.value);
  if (!Number.isInteger(value) || value < MIN_SIZE || value > MAX_SIZE) return null;
  return value;
}

function applySize() {
  const map = state.current;
  if (!map) return;
  const cols = readSize(colsInput);
  const rows = readSize(rowsInput);
  if (cols === null || rows === null) {
    showPageToast(`Width and height must be whole numbers from ${MIN_SIZE} to ${MAX_SIZE}.`, "warn");
    syncSizeInputs();
    return;
  }
  if (cols === map.cols && rows === map.rows) return;
  const lost = cellsOutsideResize(map.cells, map.cols, map.rows, cols, rows);
  if (lost.length) {
    const lines = lost.slice(0, 8).map((item) => cellLabel(item.cell, item.row, item.column));
    const extra = lost.length - lines.length;
    const more = extra > 0 ? `\n…and ${extra} more.` : "";
    const noun = lost.length === 1 ? "cell" : "cells";
    const ok = window.confirm(`Shrinking removes ${lost.length} ${noun}:\n${lines.join("\n")}${more}\n\nShrink anyway?`);
    if (!ok) {
      syncSizeInputs();
      return;
    }
  }
  map.cells = resizeMapCells(map.cells, map.cols, map.rows, cols, rows);
  map.cols = cols;
  map.rows = rows;
  markDirty();
  renderGrid();
}

function renderGrid() {
  const map = state.current;
  tierValues = state.view === "difficulty" ? difficultyTierValues(map, findProblem) : [];
  mapEl.dataset.cols = String(map.cols);
  mapEl.dataset.rows = String(map.rows);
  layoutMapGrid(mapEl, map.cols, map.rows);
  mapEl.replaceChildren();
  map.cells.forEach((cell, index) => {
    if (!cell) return;
    const row = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;
    const button = el("button", "grid-cell");
    button.type = "button";
    button.dataset.index = String(index);
    applyCellFace(button, cell, index);
    button.setAttribute("aria-label", cellLabel(cell, row, column));
    mapEl.append(button);
  });
  paintEditorPhoto();
  renderMapCounts(countsEl, map);
}

let photoLayout = null;

function paintEditorPhoto(onlyIndex) {
  const map = state.current;
  const photo = mapBackdrop(map) === "photo" ? map.photo : "";
  const targets = onlyIndex == null
    ? [...mapEl.querySelectorAll(".grid-cell")]
    : [...mapEl.querySelectorAll(`[data-index="${onlyIndex}"]`)];
  for (const button of targets) button.querySelector(".cell-photo")?.remove();
  if (!photo) {
    photoLayout = null;
    delete mapEl.dataset.photoSrc;
    return;
  }
  const styles = getComputedStyle(mapEl);
  const cell = parseFloat(styles.getPropertyValue("--cell")) || CELL_SIZE;
  const gap = parseFloat(styles.columnGap) || 0;
  if (photoLayout?.photo === photo && photoLayout.cols === map.cols && photoLayout.rows === map.rows && photoLayout.cell === cell) {
    applyPhotoLayers(targets, photoLayout);
    return;
  }
  const img = new Image();
  img.onload = () => {
    if (!mapEl.isConnected || mapBackdrop(state.current) !== "photo" || state.current.photo !== photo) return;
    const gridW = map.cols * cell + gap * Math.max(0, map.cols - 1);
    const gridH = map.rows * cell + gap * Math.max(0, map.rows - 1);
    photoLayout = {
      photo, cols: map.cols, rows: map.rows, cell, gap,
      cover: photoCover(img.naturalWidth, img.naturalHeight, gridW, gridH),
    };
    applyPhotoLayers([...mapEl.querySelectorAll(".grid-cell")], photoLayout);
  };
  mapEl.dataset.photoSrc = photo;
  img.src = photo;
}

function applyPhotoLayers(buttons, layout) {
  for (const button of buttons) {
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || button.querySelector(".cell-photo")) continue;
    const layer = document.createElement("span");
    layer.className = "cell-photo";
    layer.style.backgroundImage = `url("${layout.photo}")`;
    layer.style.backgroundSize = `${layout.cover.drawW}px ${layout.cover.drawH}px`;
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    layer.style.backgroundPosition = `${layout.cover.offsetX - col * (layout.cell + layout.gap)}px ${layout.cover.offsetY - row * (layout.cell + layout.gap)}px`;
    button.append(layer);
  }
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
  if (state.view === "difficulty") tierValues = difficultyTierValues(map, findProblem);
  applyCellFace(button, cell, index);
  button.setAttribute("aria-label", cellLabel(cell, row, column));
  paintEditorPhoto(index);
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
          syncSizeInputs();
          renderView();
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