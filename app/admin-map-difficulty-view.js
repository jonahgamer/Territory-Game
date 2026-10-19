import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { problemDifficulty } from "../shared/difficulty.js";
import { layoutMapGrid, mapMode, renderMapCounts } from "../shared/map-render.js";

const params = new URLSearchParams(location.search);
const mapId = params.get("map") || params.get("id");

const gridEl   = document.getElementById("editor-grid");
const titleEl  = document.getElementById("editor-title");
const sizeEl   = document.getElementById("editor-size");
const countsEl = document.getElementById("map-counts");
const modeEl   = document.getElementById("map-mode-text");
const legendEl = document.getElementById("difficulty-legend");
const errorEl  = document.getElementById("load-error");

// ── Difficulty ↔ numeric elevation ───────────────────────────
const HEIGHT = {
  easy:    1,
  normal:  2,
  hard:    3,
  insane:  4,
  unknown: 0.5,
  empty:   0,
  obstacle:2,
  spawnpoint:1,
};

// Colour ramp sampled continuously between the difficulty stops.
// These are the *endpoints* of the ramp — intermediate heights are
// interpolated, giving smooth topographic banding.
const RAMP = [
  { h: 0.0, c: "#101820" }, // empty / low ground — very dark
  { h: 1.0, c: "#4caf50" }, // easy — green
  { h: 2.0, c: "#ff9800" }, // normal — orange
  { h: 3.0, c: "#f44336" }, // hard — red
  { h: 4.0, c: "#9c27b0" }, // insane — purple
];

// Legend swatches (discrete labels for readability).
const LEGEND = [
  ["Easy",       "#4caf50"],
  ["Normal",     "#ff9800"],
  ["Hard",       "#f44336"],
  ["Insane",     "#9c27b0"],
  ["Obstacle",   "#2c2c3a"],
  ["Spawn",      "#0a7ea4"],
  ["Empty",      "#101820"],
];

// ── Height field + smoothing ─────────────────────────────────
// Same idea as before: same‑kind neighbours pull harder, so equal‑
// difficulty regions stay flat and boundaries ramp. But now we ALSO
// run a couple of extra box‑blur passes so the whole field reads as
// continuous terrain instead of a single step.
function buildHeightField(map, findProblem) {
  const { cols, rows, cells } = map;
  const n = rows * cols;
  const raw = new Float32Array(n);
  const kindOf = new Array(n).fill("empty");

  for (let i = 0; i < n; i++) {
    const cell = cells[i];
    if (!cell) { raw[i] = HEIGHT.empty; kindOf[i] = "empty"; continue; }
    if (cell.kind === "obstacle")   { raw[i] = HEIGHT.obstacle;   kindOf[i] = "obstacle"; continue; }
    if (cell.kind === "spawnpoint") { raw[i] = HEIGHT.spawnpoint; kindOf[i] = "spawnpoint"; continue; }
    if (cell.kind === "empty")      { raw[i] = HEIGHT.empty;      kindOf[i] = "empty"; continue; }
    if (cell.kind === "problem") {
      const prob = findProblem(cell.problemNo, cell.type);
      const diff = problemDifficulty(prob) || "unknown";
      raw[i] = HEIGHT[diff] ?? HEIGHT.unknown;
      kindOf[i] = diff;
      continue;
    }
    raw[i] = HEIGHT.unknown;
    kindOf[i] = "unknown";
  }

  // Pass 1 — kind‑weighted neighbour average (preserves bands).
  const pass1 = new Float32Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let sum = raw[i] * 2, weight = 2;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const ni = nr * cols + nc;
          const w = kindOf[ni] === kindOf[i] ? 1.5 : 0.4;
          sum += raw[ni] * w; weight += w;
        }
      }
      pass1[i] = sum / weight;
    }
  }

  // Pass 2 — plain box blur (8 neighbours + self), repeated twice.
  // This is what turns stepped bands into smooth slopes.
  let field = pass1;
  for (let iter = 0; iter < 2; iter++) {
    const next = new Float32Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        let sum = field[i], count = 1;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            sum += field[nr * cols + nc]; count++;
          }
        }
        next[i] = sum / count;
      }
    }
    field = next;
  }

  return { height: field, kind: kindOf };
}

// ── Colour ramp interpolation ────────────────────────────────
function heightToColour(h) {
  const clamped = Math.max(0, Math.min(4, h));
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i], b = RAMP[i + 1];
    if (clamped >= a.h && clamped <= b.h) {
      const t = (clamped - a.h) / (b.h - a.h);
      return mixHex(a.c, b.c, t);
    }
  }
  return RAMP[RAMP.length - 1].c;
}

function mixHex(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const ar = (na >> 16) & 0xff, ag = (na >> 8) & 0xff, ab = na & 0xff;
  const br = (nb >> 16) & 0xff, bg = (nb >> 8) & 0xff, bb = nb & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// ── Contour detection ────────────────────────────────────────
// A cell edge is a "contour" when the two adjacent cells straddle
// one of the half‑step elevations (0.5, 1.5, 2.5, 3.5). We render
// the contour as a border segment on the higher side.
const CONTOUR_LEVELS = [0.5, 1.5, 2.5, 3.5];

function contourSides(height, cols, rows, i) {
  const r = Math.floor(i / cols), c = i % cols;
  const h = height[i];
  const sides = []; // { side: "top"|"right"|"bottom"|"left", level }
  const check = (ni, side) => {
    const nh = height[ni];
    for (const lvl of CONTOUR_LEVELS) {
      // Contour at this level exists if h and nh are on opposite sides.
      if ((h < lvl && nh >= lvl) || (h >= lvl && nh < lvl)) {
        sides.push({ side, level: lvl });
        return;
      }
    }
  };
  if (r > 0)         check((r - 1) * cols + c, "top");
  if (c < cols - 1)  check(r * cols + (c + 1), "right");
  if (r < rows - 1)  check((r + 1) * cols + c, "bottom");
  if (c > 0)         check(r * cols + (c - 1), "left");
  return sides;
}

async function run() {
  if (!mapId) throw new Error("No map selected.");
  const data = await loadBootstrap();
  const map = data.maps.find((m) => m.id === mapId);
  if (!map) throw new Error("That map was not found.");

  const findProblem = (index, type) =>
    data.problems.find((p) => p.index === index && p.type === type) || null;

  titleEl.textContent = map.name;
  sizeEl.textContent = `${map.cols} × ${map.rows}`;
  modeEl.textContent = (mapMode(map) || "official").replace(/^\w/, (c) => c.toUpperCase());
  renderMapCounts(countsEl, map);

  const { height, kind } = buildHeightField(map, findProblem);

  layoutMapGrid(gridEl, map.cols, map.rows);
  gridEl.replaceChildren();
  gridEl.style.gap = "0";          // topographic maps are seamless
  gridEl.style.padding = "8px";
  gridEl.style.background = "#0b0f14";
  gridEl.style.borderRadius = "8px";

  const cells = [];
  for (let i = 0; i < map.rows * map.cols; i++) {
    const cell = map.cells[i];
    const row = Math.floor(i / map.cols) + 1;
    const column = (i % map.cols) + 1;
    const h = height[i];
    const k = kind[i];

    const tile = document.createElement("div");
    tile.className = "grid-cell difficulty-cell";
    tile.style.position = "relative";
    tile.style.aspectRatio = "1 / 1";
    tile.style.background = heightToColour(h);
    tile.style.display = "flex";
    tile.style.alignItems = "center";
    tile.style.justifyContent = "center";
    tile.style.fontFamily = '"Share Tech Mono", monospace';
    tile.style.fontSize = "0.72rem";
    tile.style.color = "#fff";
    tile.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
    tile.style.boxSizing = "border-box";

    // Problem number on problem cells (still read‑only).
    if (cell && cell.kind === "problem") {
      tile.textContent = String(cell.problemNo);
    } else if (k === "obstacle") {
      tile.textContent = "▨";
    } else if (k === "spawnpoint") {
      tile.textContent = "★";
    }

    tile.title = labelFor(cell, k, row, column, findProblem, h);

    // Contour lines — draw an inset shadow on the boundary edges.
    const sides = contourSides(height, map.cols, map.rows, i);
    for (const { side } of sides) {
      const shadow = "0 0 0 1.5px rgba(0,0,0,0.55) inset";
      if (side === "top")    tile.style.boxShadow = (tile.style.boxShadow || "") + (tile.style.boxShadow ? ", " : "") + "inset 0 2px 0 rgba(0,0,0,0.55)";
      if (side === "bottom") tile.style.boxShadow = (tile.style.boxShadow || "") + (tile.style.boxShadow ? ", " : "") + "inset 0 -2px 0 rgba(0,0,0,0.55)";
      if (side === "left")   tile.style.boxShadow = (tile.style.boxShadow || "") + (tile.style.boxShadow ? ", " : "") + "inset 2px 0 0 rgba(0,0,0,0.55)";
      if (side === "right")  tile.style.boxShadow = (tile.style.boxShadow || "") + (tile.style.boxShadow ? ", " : "") + "inset -2px 0 0 rgba(0,0,0,0.55)";
    }

    gridEl.append(tile);
    cells.push(tile);
  }

  // Optional: draw a hairline grid over the whole thing so individual
  // cells are still identifiable. Remove if you want pure contour.
  gridEl.style.backgroundImage =
    "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)," +
    "linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)";
  gridEl.style.backgroundSize = `calc(100% / ${map.cols}) calc(100% / ${map.rows})`;

  renderLegend();
}

function labelFor(cell, kind, row, column, findProblem, h) {
  const base = cell
    ? cell.kind === "problem"
      ? `${cell.type} #${cell.problemNo} — ${problemDifficulty(findProblem(cell.problemNo, cell.type)) || "unknown"}`
      : cell.kind
    : "empty";
  return `${base} (r${row} c${column}) · elevation ${h.toFixed(2)}`;
}

function renderLegend() {
  legendEl.replaceChildren();
  for (const [label, colour] of LEGEND) {
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