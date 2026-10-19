import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { problemDifficulty } from "../shared/difficulty.js";
import { layoutMapGrid, mapMode, renderMapCounts } from "../shared/map-render.js";
import { el } from "../shared/dom.js";

const params = new URLSearchParams(location.search);
const mapId = params.get("map") || params.get("id");

const gridEl   = document.getElementById("editor-grid");
const titleEl  = document.getElementById("editor-title");
const sizeEl   = document.getElementById("editor-size");
const countsEl = document.getElementById("map-counts");
const modeEl   = document.getElementById("map-mode-text");
const legendEl = document.getElementById("difficulty-legend");
const errorEl  = document.getElementById("load-error");

// Colour palette — tweak to taste.
const COLOURS = {
  easy:   "#4caf50",
  normal: "#ff9800",
  hard:   "#f44336",
  insane: "#9c27b0",
  unknown:"#9e9e9e",
  obstacle:"#2c2c3a",
  spawnpoint:"#0a7ea4",
  empty:  "#1a1a24",
};

async function run() {
  if (!mapId) throw new Error("No map selected.");
  const data = await loadBootstrap();
  const map = data.maps.find((m) => m.id === mapId);
  if (!map) throw new Error("That map was not found.");

  // The real editor uses findProblem(index, type) against the full problems
  // list to enrich each cell — we do the same so problemDifficulty works.
  const findProblem = (index, type) =>
    data.problems.find((p) => p.index === index && p.type === type) || null;

  titleEl.textContent = map.name;
  sizeEl.textContent = `${map.cols} × ${map.rows}`;
  modeEl.textContent = (mapMode(map) || "official").replace(/^\w/, (c) => c.toUpperCase());
  renderMapCounts(countsEl, map);

  layoutMapGrid(gridEl, map.cols, map.rows);
  gridEl.replaceChildren();

  map.cells.forEach((cell, index) => {
    if (!cell) return;
    const row = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;
    const button = el("button", "grid-cell difficulty-cell", "");
    button.type = "button";
    button.disabled = true;                    // read‑only
    button.dataset.index = String(index);

    const bg = colourFor(cell, findProblem);
    button.style.background = bg;
    button.style.color = "#fff";
    button.style.textShadow = "0 1px 2px rgba(0,0,0,0.6)";
    button.style.aspectRatio = "1 / 1";

    // Reuse the editor's number rendering for problem cells.
    if (cell.kind === "problem") {
      const prob = findProblem(cell.problemNo, cell.type);
      button.textContent = prob ? String(cell.problemNo) : String(cell.problemNo);
      button.title = `${cell.type} #${cell.problemNo} — ${problemDifficulty(prob) || "unknown"}`;
    } else if (cell.kind === "obstacle") {
      button.textContent = "";
      button.title = "Obstacle";
    } else if (cell.kind === "spawnpoint") {
      button.textContent = "";
      button.title = "Spawn point";
    } else {
      button.textContent = "";
      button.title = `Empty (row ${row}, col ${column})`;
    }

    gridEl.append(button);
  });

  renderLegend();
}

function colourFor(cell, findProblem) {
  if (!cell) return COLOURS.empty;
  if (cell.kind === "obstacle")   return COLOURS.obstacle;
  if (cell.kind === "spawnpoint") return COLOURS.spawnpoint;
  if (cell.kind === "empty")      return COLOURS.empty;
  if (cell.kind === "problem") {
    const prob = findProblem(cell.problemNo, cell.type);
    const diff = problemDifficulty(prob);
    return COLOURS[diff] || COLOURS.unknown;
  }
  return COLOURS.unknown;
}

function renderLegend() {
  const items = [
    ["Easy",       COLOURS.easy],
    ["Normal",     COLOURS.normal],
    ["Hard",       COLOURS.hard],
    ["Insane",     COLOURS.insane],
    ["Unknown",    COLOURS.unknown],
    ["Obstacle",   COLOURS.obstacle],
    ["Spawn",      COLOURS.spawnpoint],
    ["Empty",      COLOURS.empty],
  ];
  legendEl.replaceChildren();
  for (const [label, colour] of items) {
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.gap = "0.4rem";
    const sw = document.createElement("span");
    sw.style.width = "16px";
    sw.style.height = "16px";
    sw.style.borderRadius = "3px";
    sw.style.background = colour;
    sw.style.border = "1px solid rgba(255,255,255,0.2)";
    span.append(sw, document.createTextNode(label));
    legendEl.append(span);
  }
}

if (requireAdmin()) {
  initNav("maps");
  bindToastClose();
  run().catch((err) => {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = err.message || "Could not open the map.";
    }
    showPageToast(err.message || "Could not open the map.", "warn");
  });
}