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

// ── Difficulty ↔ numeric height ──────────────────────────────
// Higher number = higher tile. Easy sits low, insane towers.
const HEIGHT = {
  easy:    1,
  normal:  2,
  hard:    3,
  insane:  4,
  unknown: 0.5,
  empty:   0,       // flat ground
  obstacle:2,       // obstacles read as mid‑height blocks
  spawnpoint:1,     // spawns sit near ground
};

// Colour ramp (low → high). Used for the top face of each tile.
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

// ── Smoothing ────────────────────────────────────────────────
// When a cell's difficulty equals a neighbour's, blend the two
// heights so the surface slopes instead of stepping. We do this
// for the *rendered* height only — the colour stays tied to the
// true difficulty so difficulty is still legible.
function buildHeightField(map, findProblem) {
  const { cols, rows, cells } = map;
  const raw = new Array(rows * cols).fill(0);
  const kindOf = new Array(rows * cols).fill("empty");

  for (let i = 0; i < rows * cols; i++) {
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

  // Smooth: for each cell, average its raw height with all 8 neighbours,
  // but weight a neighbour more heavily if it shares the same *kind*
  // (same difficulty / same non‑problem type). This produces smooth
  // ramps between same‑difficulty cells, while keeping distinct
  // difficulty bands visibly stepped.
  const smoothed = new Array(rows * cols).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let sum = raw[i] * 2; // self weight
      let weight = 2;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const ni = nr * cols + nc;
          const w = kindOf[ni] === kindOf[i] ? 1.5 : 0.4;
          sum += raw[ni] * w;
          weight += w;
        }
      }
      smoothed[i] = sum / weight;
    }
  }
  return { height: smoothed, kind: kindOf };
}

// Map a smoothed height (≈0‥4) to a vertical pixel offset.
// Tiles are placed with CSS transform + a faux‑3D top/side face.
function verticalOffset(h) {
  const MAX_PX = 26;       // tallest tile rises ~26px
  const t = Math.max(0, Math.min(4, h)) / 4;
  return Math.round(t * MAX_PX);
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
  gridEl.style.perspective = "900px";
  gridEl.style.transformStyle = "preserve-3d";

  for (let i = 0; i < map.rows * map.cols; i++) {
    const cell = map.cells[i];
    const row = Math.floor(i / map.cols) + 1;
    const column = (i % map.cols) + 1;
    const k = kind[i];
    const h = height[i];
    const rise = verticalOffset(h);

    // Wrapper (holds the 3‑D tile)
    const wrap = document.createElement("div");
    wrap.className = "grid-cell difficulty-cell";
    wrap.style.position = "relative";
    wrap.style.aspectRatio = "1 / 1";
    wrap.style.perspective = "600px";
    wrap.title = labelFor(cell, k, row, column, findProblem);

    // The visible tile: a top face plus a slanted side face to fake height.
    const tile = document.createElement("div");
    tile.style.position = "absolute";
    tile.style.inset = "0";
    tile.style.transformStyle = "preserve-3d";
    tile.style.transform = `translateY(${-rise}px) rotateX(18deg)`;
    tile.style.transition = "transform 120ms ease-out";

    const faceColour = COLOURS[k] || COLOURS.unknown;

    const top = document.createElement("div");
    top.style.position = "absolute";
    top.style.inset = "0";
    top.style.borderRadius = "4px";
    top.style.background = faceColour;
    top.style.boxShadow =
      `0 ${rise + 2}px 0 rgba(0,0,0,0.45), ` +           // drop shadow = height
      `inset 0 1px 0 rgba(255,255,255,0.25), ` +         // top highlight
      `inset 0 -2px 0 rgba(0,0,0,0.25)`;                 // bottom shade
    top.style.display = "flex";
    top.style.alignItems = "center";
    top.style.justifyContent = "center";
    top.style.color = "#fff";
    top.style.fontFamily = '"Share Tech Mono", monospace';
    top.style.fontSize = "0.75rem";
    top.style.textShadow = "0 1px 2px rgba(0,0,0,0.7)";
    top.style.position = "relative";

    // Problem number on problem cells
    if (cell && cell.kind === "problem") {
      top.textContent = String(cell.problemNo);
    } else if (k === "obstacle") {
      top.style.background =
        "repeating-linear-gradient(45deg, #2c2c3a 0 6px, #3a3a4c 6px 12px)";
    } else if (k === "spawnpoint") {
      top.textContent = "★";
      top.style.fontSize = "1rem";
    }

    // Faux side face: a thin slab hanging from the top face down to the
    // grid plane, giving the block visible thickness.
    if (rise > 0) {
      const side = document.createElement("div");
      side.style.position = "absolute";
      side.style.left = "0";
      side.style.right = "0";
      side.style.top = "100%";
      side.style.height = `${rise}px`;
      side.style.background = shade(faceColour, -0.35);
      side.style.transformOrigin = "top";
      side.style.transform = "rotateX(-18deg)";
      side.style.borderRadius = "0 0 4px 4px";
      tile.append(side);
    }

    tile.append(top);
    wrap.append(tile);

    // Hover lifts the tile a touch more (purely visual, still read‑only).
    wrap.addEventListener("mouseenter", () => {
      tile.style.transform = `translateY(${-rise - 4}px) rotateX(18deg) scale(1.04)`;
      tile.style.zIndex = "3";
    });
    wrap.addEventListener("mouseleave", () => {
      tile.style.transform = `translateY(${-rise}px) rotateX(18deg)`;
      tile.style.zIndex = "";
    });

    gridEl.append(wrap);
  }

  // Push grid down so raised tiles have room to rise into.
  gridEl.style.paddingTop = "32px";

  renderLegend();
}

function labelFor(cell, kind, row, column, findProblem) {
  if (!cell) return `Empty (r${row} c${column})`;
  if (cell.kind === "obstacle")   return `Obstacle (r${row} c${column})`;
  if (cell.kind === "spawnpoint") return `Spawn point (r${row} c${column})`;
  if (cell.kind === "empty")      return `Empty (r${row} c${column})`;
  if (cell.kind === "problem") {
    const prob = findProblem(cell.problemNo, cell.type);
    const diff = problemDifficulty(prob) || "unknown";
    return `${cell.type} #${cell.problemNo} — ${diff} (r${row} c${column})`;
  }
  return `Unknown (r${row} c${column})`;
}

// Darken / lighten a hex colour by `amount` (-1‥1)
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  r = f(r); g = f(g); b = f(b);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
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