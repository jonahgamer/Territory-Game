import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { el, renderList } from "../shared/dom.js";
import { mapMode } from "../shared/map-render.js";

let state = { maps: [], revisions: { maps: 0 }, listMode: "official" };

async function run() {
  try {
    const data = await loadPage("page-maps");
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
    state.listMode = btn.dataset.mapMode === "testing" ? "testing" : "official";
    renderMode();
    renderList_();
  });
}

function renderMode() {
  for (const btn of document.querySelectorAll("[data-map-mode]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.mapMode === state.listMode));
  }
  const link = document.querySelector("#create-map-link");
  if (link) link.href = `/admin/map-create.html?mode=${state.listMode}`;
}

function renderList_() {
  const group = state.maps.filter((m) => mapMode(m) === state.listMode);
  const empty = document.querySelector("#map-empty");
  const list = document.querySelector("#map-list");
  if (!empty || !list) return;
  empty.hidden = group.length > 0;
  empty.textContent = state.maps.length === 0 ? "No maps yet."
    : state.listMode === "testing" ? "No testing maps yet." : "No official maps yet.";
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

if (requireAdmin()) {
  initNav("maps");
  bindToastClose();
  run();
}