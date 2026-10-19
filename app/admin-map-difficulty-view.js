// /app/admin-map-difficulty-view.js
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

// ── Palette ──────────────────────────────────────────────────
// easy → green, med/normal → yellow, hard → brown, insane → white.
const DIFFICULTY_COLOURS = {
  easy:    "#2e7d32",   // green
  normal:  "#f9a825",   // yellow ("med")
  medium:  "#f9a825",   // alias, in case difficulty names change
  hard:    "#6d4c41",   // brown
  insane:  "#ffffff",   // white
  unknown: "#9e9e9e",   // grey fallback
};
const OTHER_COLOURS = {
  obstacle:   "#2c2c3a",  // dark slate
  spawnpoint: "#0a7ea4",  // teal
  empty:      "#1a1a24",  // near‑black
};

// Text colours chosen for contrast against the backgrounds above.
function textColourFor(bg) {
  // White / near‑white backgrounds need dark text.
  return (bg === DIFFICULTY_COLOURS.insane) ? "#111111" : "#ffffff";
}

// ── Main ─────────────────────────────────────────────────────
async function run() {
  if (!mapId) throw new Error("No map selected.");

  const data = await loadBootstrap();
  const map = data.maps.find((m) => m.id === mapId);
  if (!map) throw new Error("That map was not found.");

  // Same enrichment the real editor uses: look up the problem record
  // for a problem cell so we can read its difficulty.
  const findProblem = (index, type) =>
    data.problems.find((p) => p.index === index && p.type === type) || null;

  titleEl.textContent = map.name;
  sizeEl.textContent  = `${map.cols} × ${map.rows}`;
  modeEl.textContent  = (mapMode(map) || "official")
    .replace(/^\w/, (c) => c.toUpperCase());
  renderMapCounts(countsEl, map);

  renderGrid(map, findProblem);
  renderLegend();
}

// ── Grid rendering ───────────────────────────────────────────
function renderGrid(map, findProblem) {
  layoutMapGrid(gridEl, map.cols, map.rows);
  gridEl.replaceChildren();

  map.cells.forEach((cell, index) => {
    if (!cell) return;

    const row    = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;

    const button = el("button", "grid-cell difficulty-cell", "");
    button.type = "button";
    button.disabled = true;                // read‑only
    button.dataset.index = String(index);
    button.style.aspectRatio = "1 / 1";
    button.style.border = "0";
    button.style.padding = "0";
    button.style.fontFamily = '"Share Tech Mono", monospace';
    button.style.fontSize = "0.85rem";
    button.style.fontWeight = "600";
    button.style.cursor = "default";

    const bg = backgroundFor(cell, findProblem);
    button.style.background = bg;
    button.style.color = textColourFor(bg);
    button.style.textShadow =
      bg === DIFFICULTY_COLOURS.insane ? "none" : "0 1px 2px rgba(0,0,0,0.55)";

    if (cell.kind === "problem") {
      const prob = findProblem(cell.problemNo, cell.type);
      const diff = problemDifficulty(prob) || "unknown";
      button.textContent = String(cell.problemNo);
      button.title =
        `${cell.type} #${cell.problemNo} — ${diff}`;
    } else if (cell.kind === "obstacle") {
      button.title = "Obstacle";
    } else if (cell.kind === "spawnpoint") {
      button.title = "Spawn point";
    } else {
      button.title = `Empty (row ${row}, col ${column})`;
    }

    gridEl.append(button);
  });
}

function backgroundFor(cell, findProblem) {
  if (!cell) return OTHER_COLOURS.empty;
  switch (cell.kind) {
    case "obstacle":   return OTHER_COLOURS.obstacle;
    case "spawnpoint": return OTHER_COLOURS.spawnpoint;
    case "empty":      return OTHER_COLOURS.empty;
    case "problem": {
      const prob = findProblem(cell.problemNo, cell.type);
      const diff = problemDifficulty(prob);
      return DIFFICULTY_COLOURS[diff] || DIFFICULTY_COLOURS.unknown;
    }
    default: return OTHER_COLOURS.empty;
  }
}

// ── Legend ───────────────────────────────────────────────────
function renderLegend() {
  const items = [
    ["Easy",      DIFFICULTY_COLOURS.easy],
    ["Med",       DIFFICULTY_COLOURS.normal],
    ["Hard",      DIFFICULTY_COLOURS.hard],
    ["Insane",    DIFFICULTY_COLOURS.insane],
    ["Unknown",   DIFFICULTY_COLOURS.unknown],
    ["Obstacle",  OTHER_COLOURS.obstacle],
    ["Spawn",     OTHER_COLOURS.spawnpoint],
    ["Empty",     OTHER_COLOURS.empty],
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
    sw.style.border = "1px solid rgba(255,255,255,0.25)";

    span.append(sw, document.createTextNode(label));
    legendEl.append(span);
  }
}

// ── Boot ─────────────────────────────────────────────────────
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