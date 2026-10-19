import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { api } from "../shared/api.js";
import { el, renderList } from "../shared/dom.js";
import { MIN_SIZE, MAX_SIZE } from "../shared/constants.js";
import { mapMode, emptyCells } from "../shared/map-render.js";



let state = { maps: [], revisions: { maps: 0 }, newMode: "official" };

async function run() {
  try {
    const data = await loadBootstrap();
    state.maps = data.maps;
    state.revisions = data.revisions;
    renderMode();
    renderList_();
  } catch (err) {
    document.querySelector("#load-error").hidden = false;
    document.querySelector("#load-error").textContent = err.message;
  }

  document.querySelector("#map-mode-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-map-mode]");
    if (!btn) return;
    state.newMode = btn.dataset.mapMode === "testing" ? "testing" : "official";
    renderMode();
    renderList_();
  });

  document.querySelector("#create-map-form")?.addEventListener("submit", onCreateMap);
}

function renderMode() {
  for (const btn of document.querySelectorAll("[data-map-mode]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.mapMode === state.newMode));
  }
}

function renderList_() {
  const group = state.maps.filter((m) => mapMode(m) === state.newMode);
  const empty = document.querySelector("#map-empty");
  const list = document.querySelector("#map-list");
  if (!empty || !list) return;
  empty.hidden = group.length > 0;
  empty.textContent = state.maps.length === 0 ? "No maps yet."
    : state.newMode === "testing" ? "No testing maps yet." : "No official maps yet.";
  list.hidden = group.length === 0;
  renderList(list, group, (map) => {
    const item = el("li");
    const button = el("button", "open-map");
    button.type = "button";
    button.setAttribute("aria-label", `Open map ${map.name}`);
    button.append(createPreview(map));
    const label = el("span", "map-label");
    label.append(
      el("span", "map-name", map.name),
      el("span", "map-size", `${map.cols} × ${map.rows}`)
    );
    button.append(label);
    button.addEventListener("click", () => {
      location.assign(`/admin/map-editor.html?map=${encodeURIComponent(map.id)}`);
    });
    item.append(button);
    return item;
  });
}

function createPreview(map) {
  const preview = el("div", "map-preview");
  const showNumbers = map.cols <= 6 && map.rows <= 6;
  preview.style.gridTemplateColumns = `repeat(${map.cols}, 1fr)`;
  preview.style.gridTemplateRows = `repeat(${map.rows}, 1fr)`;
  if (map.cols > 16 || map.rows > 16) preview.style.gap = "0";
  for (const cell of map.cells || []) {
    const node = el("span", `preview-cell ${cell.kind}${cell.kind === "problem" ? ` ${cell.type}` : ""}`);
    if (showNumbers) node.textContent = cell.kind === "problem" ? `${(cell.type[0] || "M").toUpperCase()}${cell.problemNo}` : (cell.kind === "spawnpoint" ? "S" : "");
    preview.append(node);
  }
  return preview;
}

async function onCreateMap(event) {
  event.preventDefault();
  const name = document.querySelector("#map-name").value.trim();
  const cols = Number(document.querySelector("#map-cols").value);
  const rows = Number(document.querySelector("#map-rows").value);
  const formError = document.querySelector("#map-form-error");

  if (!name || name.length > 60) {
    formError.hidden = false;
    formError.textContent = "Give the map a name (1–60 characters).";
    return;
  }
  if (!Number.isInteger(cols) || cols < MIN_SIZE || cols > MAX_SIZE
    || !Number.isInteger(rows) || rows < MIN_SIZE || rows > MAX_SIZE) {
    formError.hidden = false;
    formError.textContent = `Width and height must be whole numbers from ${MIN_SIZE} to ${MAX_SIZE}.`;
    return;
  }
  formError.hidden = true;

  const newMap = {
    id: crypto.randomUUID(),
    name,
    cols,
    rows,
    cells: emptyCells(cols * rows),
    mode: state.newMode,
    backdrop: "terrain",
    photo: "",
  };

  state.maps.unshift(newMap);
  renderList_();

  try {
    const data = await api.saveMaps(state.maps, state.revisions.maps);
    state.revisions.maps = data.revision;
    showPageToast(`Map ${name} created.`, "ok");
    location.assign(`/admin/map-editor.html?map=${encodeURIComponent(newMap.id)}`);
  } catch (err) {
    state.maps = state.maps.filter((m) => m.id !== newMap.id);
    renderList_();
    formError.hidden = false;
    formError.textContent = err.message || "Could not save the new map.";
  }
}
if (requireAdmin()) {
  initNav("maps");
  bindToastClose();
  run();
}