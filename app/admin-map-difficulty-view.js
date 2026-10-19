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

// Colour ramp — interpolated continuously across smoothed height.
const RAMP = [
  { h: 0.0, c: "#101820" },
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
  ["Empty",    "#101820"],
];

const CONTOUR_LEVELS = [0.5, 1.5, 2.5, 3.5];

// 3‑D tuning
const MAX_LIFT_PX   = 42;    // tallest tile rises this many px
const TILT_DEG      = 55;    // X‑rotation of the whole grid
const TILE_GAP_PX   = 1;     // tiny gap so edges read as cells

// ── Height field + smoothing (same as topo version) ─────────
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

  // Kind‑weighted pass to preserve bands.
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

// ── Colour ramp ─────────────────────────────────────────────
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

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return "#" + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}

// ── Contour edge detection ──────────────────────────────────
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

  // Grid wrapper: tilt the whole scene so heights go "up" the page.
  layoutMapGrid(gridEl, map.cols, map.rows);
  gridEl.replaceChildren();
  gridEl.style.gap = `${TILE_GAP_PX}px`;
  gridEl.style.padding = "0";
  gridEl.style.background = "transparent";
  gridEl.style.perspective = "1400px";
  gridEl.style.transformStyle = "preserve-3d";
  // Wrap the grid in a tilted container so transforms stay inside it.
  let scene = gridEl.parentElement;
  if (!scene || !scene.classList.contains("scene-3d")) {
    scene = document.createElement("div");
    scene.className = "scene-3d";
    gridEl.parentNode.insertBefore(scene, gridEl);
    scene.appendChild(gridEl);
  }
  scene.style.perspective = "1400px";
  scene.style.transformStyle = "preserve-3d";
  scene.style.padding = "80px 24px 140px";
  scene.style.overflow = "hidden";
  scene.style.background =
    "radial-gradient(ellipse at 50% 20%, #1a2233 0%, #0b0f14 70%)";
  scene.style.borderRadius = "10px";
  gridEl.style.transform = `rotateX(${TILT_DEG}deg)`;
  gridEl.style.transformOrigin = "50% 50%";
  gridEl.style.transformStyle = "preserve-3d";

  const tiles = [];
  for (let i = 0; i < map.rows * map.cols; i++) {
    const cell = map.cells[i];
    const row = Math.floor(i / map.cols) + 1;
    const column = (i % map.cols) + 1;
    const h = height[i];
    const k = kind[i];
    const colour = heightToColour(h);
    const lift = (Math.max(0, Math.min(4, h)) / 4) * MAX_LIFT_PX;

    // Outer wrapper: sits on the tilted plane, provides perspective for the tile.
    const wrap = document.createElement("div");
    wrap.className = "grid-cell difficulty-cell";
    wrap.style.position = "relative";
    wrap.style.aspectRatio = "1 / 1";
    wrap.style.transformStyle = "preserve-3d";
    wrap.style.perspective = "600px";

    // Tile: translated up by `lift` so it floats above the plane.
    const tile = document.createElement("div");
    tile.style.position = "absolute";
    tile.style.inset = "0";
    tile.style.transformStyle = "preserve-3d";
    tile.style.transform = `translateZ(${lift}px)`;
    tile.style.transition = "transform 140ms ease-out";

    // Top face
    const top = document.createElement("div");
    top.style.position = "absolute";
    top.style.inset = "0";
    top.style.borderRadius = "3px";
    top.style.background = colour;
    top.style.display = "flex";
    top.style.alignItems = "center";
    top.style.justifyContent = "center";
    top.style.fontFamily = '"Share Tech Mono", monospace';
    top.style.fontSize = "0.72rem";
    top.style.color = "#fff";
    top.style.textShadow = "0 1px 2px rgba(0,0,0,0.85)";
    top.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.06)";
    top.style.backfaceVisibility = "hidden";

    // Contour edges → dark inset line on the boundary side
    for (const side of contourSides(height, map.cols, map.rows, i)) {
      const line = "inset 0 0 0 2px rgba(0,0,0,0.55)";
      if (side === "top")    top.style.boxShadow += ", inset 0 3px 0 rgba(0,0,0,0.6)";
      if (side === "bottom") top.style.boxShadow += ", inset 0 -3px 0 rgba(0,0,0,0.6)";
      if (side === "left")   top.style.boxShadow += ", inset 3px 0 0 rgba(0,0,0,0.6)";
      if (side === "right")  top.style.boxShadow += ", inset -3px 0 0 rgba(0,0,0,0.6)";
    }

    if (cell && cell.kind === "problem") {
      top.textContent = String(cell.problemNo);
    } else if (k === "obstacle") {
      top.style.background =
        "repeating-linear-gradient(45deg, #2c2c3a 0 6px, #3a3a4c 6px 12px)";
    } else if (k === "spawnpoint") {
      top.textContent = "★";
    }

    tile.appendChild(top);

    // Extruded sides: only build visible walls (front + right, since the
    // grid is tilted down‑and‑toward the viewer). Lift determines wall height.
    if (lift > 1) {
      const wallColour = shade(colour, -0.4);
      const leftColour = shade(colour, -0.28);

      // Front wall (facing viewer, i.e. bottom edge of the tile)
      const front = document.createElement("div");
      front.style.position = "absolute";
      front.style.left = "0";
      front.style.right = "0";
      front.style.top = "100%";
      front.style.height = `${lift}px`;
      front.style.background = wallColour;
      front.style.transformOrigin = "top";
      front.style.transform = "rotateX(-90deg)";
      front.style.borderRadius = "0 0 3px 3px";
      tile.appendChild(front);

      // Left wall (only seen when tile is lifted; helps depth read)
      const left = document.createElement("div");
      left.style.position = "absolute";
      left.style.top = "0";
      left.style.bottom = "0";
      left.style.right = "100%";
      left.style.width = `${lift}px`;
      left.style.background = leftColour;
      left.style.transformOrigin = "right";
      left.style.transform = "rotateY(-90deg)";
      tile.appendChild(left);
    }

    wrap.appendChild(tile);
    gridEl.appendChild(wrap);
    tiles.push({ wrap, tile, lift });
  }

  // Hover: raise the tile 10px more, bring it forward.
  tiles.forEach(({ wrap, tile, lift }) => {
    wrap.addEventListener("mouseenter", () => {
      tile.style.transform = `translateZ(${lift + 10}px)`;
      wrap.style.zIndex = "5";
    });
    wrap.addEventListener("mouseleave", () => {
      tile.style.transform = `translateZ(${lift}px)`;
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