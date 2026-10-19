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

const RAMP = [
  { h: 0.0, c: "#1e2430" }, // slightly lighter base so shadows read
  { h: 1.0, c: "#4caf50" },
  { h: 2.0, c: "#ff9800" },
  { h: 3.0, c: "#f44336" },
  { h: 4.0, c: "#9c27b0" },
];

const LEGEND = [
  ["Easy",     "#4caf50"],
  ["Normal",   "#ff9800"],
  ["Hard",     "#f44336"],
  ["Insane",   "#9c27b0"],
  ["Obstacle", "#2c2c3a"],
  ["Spawn",    "#0a7ea4"],
  ["Empty",    "#1e2430"],
];

// ── Fake‑3D tuning ──────────────────────────────────────────
const MAX_LIFT_PX = 22;   // how far the "top" of the tallest tile is offset
const SIDE_RATIO  = 1.0;  // side extent = lift * SIDE_RATIO (1.0 = 45° bevel)
const OFFSET_X    = 0;    // optional global shift of the top faces

const CONTOUR_LEVELS = [0.5, 1.5, 2.5, 3.5];

// ── Height field + smoothing (unchanged logic) ──────────────
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

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return "#" + ((1 << 24)
    | (f((n >> 16) & 0xff) << 16)
    | (f((n >> 8) & 0xff) << 8)
    | f(n & 0xff)
  ).toString(16).slice(1);
}

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

// ── Render ──────────────────────────────────────────────────
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
  gridEl.style.padding = "40px 32px 60px";
  gridEl.style.background =
    "radial-gradient(ellipse at 50% 30%, #1a2233 0%, #0b0f14 75%)";
  gridEl.style.borderRadius = "10px";
  gridEl.style.overflow = "hidden";

  const tiles = [];
  for (let i = 0; i < map.rows * map.cols; i++) {
    const cell = map.cells[i];
    const row = Math.floor(i / map.cols) + 1;
    const column = (i % map.cols) + 1;
    const h = height[i];
    const k = kind[i];
    const colour = heightToColour(h);
    const lift = (Math.max(0, Math.min(4, h)) / 4) * MAX_LIFT_PX;
    const side = lift * SIDE_RATIO;

    // The wrapper occupies the cell's footprint and does not move.
    const wrap = document.createElement("div");
    wrap.className = "grid-cell difficulty-cell";
    wrap.style.position = "relative";
    wrap.style.aspectRatio = "1 / 1";

    // The "base" is the tile's footprint on the ground — stays put.
    // It's drawn dark so the sides reading down to it create the illusion.
    const base = document.createElement("div");
    base.style.position = "absolute";
    base.style.inset = "0";
    base.style.background = shade(colour, -0.55);
    base.style.borderRadius = "3px";
    wrap.appendChild(base);

    // Sides: two CSS gradients that fake the left and bottom faces.
    // They're rectangles anchored to the base and reaching up‑left to
    // the top face. Because the top is offset (-lift, -lift), the visible
    // side area is a strip of width `side` along the left and bottom edges.
    if (side > 0.5) {
      // Left side — gradient from top‑face colour to base colour.
      const leftFace = document.createElement("div");
      leftFace.style.position = "absolute";
      leftFace.style.left = "0";
      leftFace.style.top = `${-lift}px`;
      leftFace.style.width = `${side}px`;
      leftFace.style.height = `calc(100% + ${lift}px)`;
      leftFace.style.background = `linear-gradient(to right, ${shade(colour, -0.28)}, ${shade(colour, -0.5)})`;
      leftFace.style.borderRadius = "3px 0 0 3px";
      wrap.appendChild(leftFace);

      // Bottom side — gradient from top‑face colour to base colour.
      const bottomFace = document.createElement("div");
      bottomFace.style.position = "absolute";
      bottomFace.style.left = `${-lift}px`;
      bottomFace.style.bottom = "0";
      bottomFace.style.width = `calc(100% + ${lift}px)`;
      bottomFace.style.height = `${side}px`;
      bottomFace.style.background = `linear-gradient(to bottom, ${shade(colour, -0.2)}, ${shade(colour, -0.45)})`;
      bottomFace.style.borderRadius = "0 0 3px 3px";
      wrap.appendChild(bottomFace);
    }

    // Top face — the visible "lid". Offset up‑left by `lift`, which is
    // what makes the tile look raised: the sides above fill the gap.
    const top = document.createElement("div");
    top.style.position = "absolute";
    top.style.left = `${-lift + OFFSET_X}px`;
    top.style.top = `${-lift}px`;
    top.style.width = "100%";
    top.style.height = "100%";
    top.style.borderRadius = "3px";
    top.style.background = colour;
    top.style.display = "flex";
    top.style.alignItems = "center";
    top.style.justifyContent = "center";
    top.style.fontFamily = '"Share Tech Mono", monospace';
    top.style.fontSize = "0.72rem";
    top.style.color = "#fff";
    top.style.textShadow = "0 1px 2px rgba(0,0,0,0.85)";
    top.style.boxShadow =
      `0 ${Math.max(2, side * 0.9)}px ${Math.max(4, side * 1.4)}px rgba(0,0,0,0.55), ` +
      `inset 0 1px 0 rgba(255,255,255,0.12)`;
    top.style.transition = "top 120ms ease-out, left 120ms ease-out, box-shadow 120ms ease-out";
    top.style.zIndex = "2";

    // Contour lines on the top face.
    for (const s of contourSides(height, map.cols, map.rows, i)) {
      if (s === "top")    top.style.boxShadow += ", inset 0 3px 0 rgba(0,0,0,0.6)";
      if (s === "bottom") top.style.boxShadow += ", inset 0 -3px 0 rgba(0,0,0,0.6)";
      if (s === "left")   top.style.boxShadow += ", inset 3px 0 0 rgba(0,0,0,0.6)";
      if (s === "right")  top.style.boxShadow += ", inset -3px 0 0 rgba(0,0,0,0.6)";
    }

    if (cell && cell.kind === "problem") {
      top.textContent = String(cell.problemNo);
    } else if (k === "obstacle") {
      top.style.background =
        `repeating-linear-gradient(45deg, ${shade(colour, -0.1)} 0 6px, ${shade(colour, 0.1)} 6px 12px)`;
    } else if (k === "spawnpoint") {
      top.textContent = "★";
    }

    wrap.appendChild(top);
    gridEl.appendChild(wrap);
    tiles.push({ wrap, top, base, lift, side });
  }

  // Hover: pop the top face up another few px and deepen the shadow.
  tiles.forEach(({ wrap, top, lift, side }) => {
    wrap.addEventListener("mouseenter", () => {
      top.style.left = `${-lift - 4 + OFFSET_X}px`;
      top.style.top = `${-lift - 4}px`;
      top.style.boxShadow =
        `0 ${Math.max(4, side * 1.3)}px ${Math.max(8, side * 2)}px rgba(0,0,0,0.7), ` +
        `inset 0 1px 0 rgba(255,255,255,0.18)`;
      wrap.style.zIndex = "5";
    });
    wrap.addEventListener("mouseleave", () => {
      top.style.left = `${-lift + OFFSET_X}px`;
      top.style.top = `${-lift}px`;
      top.style.boxShadow =
        `0 ${Math.max(2, side * 0.9)}px ${Math.max(4, side * 1.4)}px rgba(0,0,0,0.55), ` +
        `inset 0 1px 0 rgba(255,255,255,0.12)`;
      wrap.style.zIndex = "";
    });
  });

  renderLegend();
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