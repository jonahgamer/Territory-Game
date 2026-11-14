import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { MIN_SIZE, MAX_SIZE } from "../shared/constants.js";
import { emptyCells } from "../shared/map-render.js";

const requested = new URLSearchParams(location.search).get("mode");
let mode = requested === "testing" ? "testing" : "official";
let revision = 0;

function renderMode() {
  for (const btn of document.querySelectorAll("[data-map-mode]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.mapMode === mode));
  }
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
    mode,
    backdrop: "terrain",
    photo: "",
  };

  try {
    const data = await api.saveMap(newMap, revision);
    revision = data.revision;
    showPageToast(`Map ${name} created.`, "ok");
    location.assign(`/admin/map-editor.html?map=${encodeURIComponent(newMap.id)}`);
  } catch (err) {
    formError.hidden = false;
    formError.textContent = err.message || "Could not save the new map.";
  }
}

async function run() {
  try {
    const data = await loadPage("page-maps");
    revision = data.revisions?.maps || 0;
  } catch (err) {
    const loadError = document.querySelector("#load-error");
    loadError.hidden = false;
    loadError.textContent = err.message;
    document.querySelector("#create-map-form").hidden = true;
    return;
  }
  renderMode();
  document.querySelector("#map-mode-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-map-mode]");
    if (!btn) return;
    mode = btn.dataset.mapMode === "testing" ? "testing" : "official";
    renderMode();
  });
  document.querySelector("#create-map-form")?.addEventListener("submit", onCreateMap);
  document.querySelector("#map-name")?.focus();
}

if (requireAdmin()) {
  initNav("maps");
  bindToastClose();
  run();
}
