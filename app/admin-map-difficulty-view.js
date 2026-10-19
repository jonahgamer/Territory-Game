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

// ── Elevation table ─────────────────────────────────────────
const HEIGHT = {
  easy: 1, normal: 2, hard: 3, insane: 4,
  unknown: 0.5, empty: 0, obstacle: 2, spawnpoint: 1,
};

// ── Hypsometric palette — vivid, high‑contrast ─────────────
// Low → high: deep forest green → bright green → gold → orange
//             → crimson → magenta → pure white peaks
const RAMP = [
  { h: 0.0, c: "#0d5c2c" }, // lowland — deep forest green
  { h: 0.7, c: "#2ecc40" }, // low hills — vivid green
  { h: 1.4, c: "#a8e832" }, // upland — bright lime
  { h: 2.0, c: "#ffd400" }, // plateau — pure gold
  { h: 2.6, c: "#ff8c00" }, // foothills — vivid orange
  { h: 3.2, c: "#e8003c" }, // mountains — crimson
  { h: 3.7, c: "#c000d0" }, // high mountains — magenta
  { h: 4.0, c: "#ffffff" }, // peaks — pure white
];

// Legend swatches — one per difficulty band.
const LEGEND = [
  ["Easy (low)",     "#2ecc40"],
  ["Normal (mid)",   "#ffd400"],
  ["Hard (high)",    "#e8003c"],
  ["Insane (peak)",  "#ffffff"],
  ["Obstacle",       "#2c2c3a"],
  ["Spawn",          "#0a7ea4"],
  ["Empty",          "#0d5c2c"],
];

const CONTOUR_LEVELS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];

// ── Height field + smoothing (unchanged) ───────────────────
function buildHeightField(map, findProblem) {
  const { cols, rows, cells } = map;
  const n = rows * cols;
  const raw = new Float32Array(n);
  const kindOf = new Array(n).fill("empty");

  for (let i = 0; i < n; i++) {
    const cell = cells[i];
    if (!cell) { raw[i] = HEIGHT.empty; continue; }
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

  // Kind‑weighted pass preserves difficulty bands.
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

  // Box blur ×2 for smooth slopes.
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

// ── Continuous hypsometric colour ──────────────────────────
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
  return "#" + ((1 << 24)
    | (Math.round(ar + (br - ar) * t) << 16)
    | (Math.round(ag + (bg - ag) * t) << 8)
    | Math.round(ab + (bb - ab) * t)
  ).toString(16).slice(1);
}

// Contrast text on light vs dark backgrounds.
function textColourFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? "#111" : "#fff";
}

// ── Contour edge detection ─────────────────────────────────
function contourSides(height, cols, rows, i) {
  const r = Math.floor(i / cols), c = i % cols;
  const h = height[i];
  const sides = [];
  const check = (ni, side) => {
    const nh = height[ni];
    for (const lvl of CONTOUR_LEVELS) {
      if ((h < lvl && nh >= lvl) || (h >= lvl && nh < lvl)) {
        sides.push(side); return;
      }
    }
  };
  if (r > 0)         check((r - 1) * cols + c, "top");
  if (c < cols - 1)  check(r * cols + (c + 1), "right");
  if (r < rows - 1)  check((r + 1) * cols + c, "bottom");
  if (c > 0)         check(r * cols + (c - 1), "left");
  return sides;
}

// ── Render ─────────────────────────────────────────────────
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
  gridEl.style.gap = "0";
  gridEl.style.padding = "12px";
  gridEl.style.background = "#0b0f14";
  gridEl.style.borderRadius = "10px";
  gridEl.style.overflow = "hidden";

  for (let i = 0; i < map.rows * map.cols; i++) {
    const cell = map.cells[i];
    const row = Math.floor(i / map.cols) + 1;
    const column = (i % map.cols) + 1;
    const h = height[i];
    const k = kind[i];
    const colour = heightToColour(h);

    const tile = document.createElement("div");
    tile.className = "grid-cell difficulty-cell";
    tile.style.position = "relative";
    tile.style.aspectRatio = "1 / 1";
    tile.style.background = colour;
    tile.style.display = "flex";
    tile.style.alignItems = "center";
    tile.style.justifyContent = "center";
    tile.style.fontFamily = '"Share Tech Mono", monospace';
    tile.style.fontSize = "0.72rem";
    tile.style.color = textColourFor(colour);
    tile.style.boxSizing = "border-box";

    // Contour lines — dark inset borders on elevation boundaries.
    for (const s of contourSides(height, map.cols, map.rows, i)) {
      if (s === "top")    tile.style.boxShadow += (tile.style.boxShadow ? ", " : "") + "inset 0 2px 0 rgba(0,0,0,0.45)";
      if (s === "bottom") tile.style.boxShadow += (tile.style.boxShadow ? ", " : "") + "inset 0 -2px 0 rgba(0,0,0,0.45)";
      if (s === "left")   tile.style.boxShadow += (tile.style.boxShadow ? ", " : "") + "inset 2px 0 0 rgba(0,0,0,0.45)";
      if (s === "right")  tile.style.boxShadow += (tile.style.boxShadow ? ", " : "") + "inset -2px 0 0 rgba(0,0,0,0.45)";
    }

    if (cell && cell.kind === "problem") {
      tile.textContent = String(cell.problemNo);
    } else if (k === "obstacle") {
      tile.style.background =
        "repeating-linear-gradient(45deg, #2c2c3a 0 5px, #3a3a4c 5px 10px)";
      tile.style.color = "#ddd";
    } else if (k === "spawnpoint") {
      tile.textContent = "★";
      tile.style.color = "#fff";
      tile.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
    }

    tile.title = labelFor(cell, k, row, column, findProblem, h);
    gridEl.appendChild(tile);
  }

  // Faint hairline grid so cells remain countable.
  gridEl.style.backgroundImage =
    "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px)," +
    "linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)";
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
    sw.style.border = "1px solid rgba(0,0,0,0.3)";
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