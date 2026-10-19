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
  { h: 0.0, c: "#1e2430" },
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

// ── Fake‑3D tuning (70° camera pitch = 20° off straight‑down) ─
// At 70° the height is clearly visible:
//  - cos(70°) ≈ 0.342 → side band is ~34% of true height
//  - 1 − cos(70°) ≈ 0.658 → top face offsets up‑left by ~66% of height
const CAMERA_PITCH_DEG = 70;
const COS_PITCH        = Math.cos(CAMERA_PITCH_DEG * Math.PI / 180); // ≈ 0.342

const MAX_LIFT_PX   = 28;                              // raw 3‑D height at tallest
const VISIBLE_LIFT  = MAX_LIFT_PX * (1 - COS_PITCH);   // ≈ 18.4px
const SIDE_HEIGHT   = MAX_LIFT_PX * COS_PITCH;         // ≈ 9.6px
const SHADOW_BLUR   = 8;
const SHADOW_OFFSET = 5;

const CONTOUR_LEVELS = [0.5, 1.5, 2.5, 3.5];

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
  gridEl.style.padding = `${VISIBLE_LIFT + 16}px ${VISIBLE_LIFT + 16}px ${VISIBLE_LIFT + 40}px`;
  gridEl.style.background =
    "radial-gradient(ellipse at 50% 25%, #1a2233 0%, #0b0f14 78%)";
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

    // Normalised height 0…1
    const t = Math.max(0, Math.min(1, h / 4));

    // At 70° pitch:
    //  - top face offsets up‑left by `lift` (≈66% of real height)
    //  - side band is `side` px tall (≈34% of real height)
    //  - the left face is a narrow strip `side` px wide
    const lift = t * VISIBLE_LIFT;
    const side = t * SIDE_HEIGHT;

    const wrap = document.createElement("div");
    wrap.className = "grid-cell difficulty-cell";
    wrap.style.position = "relative";
    wrap.style.aspectRatio = "1 / 1";

    // Base — dark footprint on the floor.
    const base = document.createElement("div");
    base.style.position = "absolute";
    base.style.inset = "0";
    base.style.background = shade(colour, -0.65);
    base.style.borderRadius = "2px";
    wrap.appendChild(base);

    if (side > 0.3) {
      // Left face — visible because we're looking slightly from the right.
      // It runs the full height of the block, from base up to the top face.
      const leftFace = document.createElement("div");
      leftFace.style.position = "absolute";
      leftFace.style.left = `${-lift}px`;
      leftFace.style.top = `${-lift}px`;
      leftFace.style.width = `${side}px`;
      leftFace.style.height = `calc(100% + ${lift}px)`;
      leftFace.style.background =
        `linear-gradient(to right, ${shade(colour, -0.32)}, ${shade(colour, -0.55)})`;
      leftFace.style.borderRadius = "2px 0 0 2px";
      wrap.appendChild(leftFace);

      // Front face — visible because we're looking slightly from above.
      // It's the bottom strip between the top face and the base.
      const frontFace = document.createElement("div");
      frontFace.style.position = "absolute";
      frontFace.style.left = `${-lift}px`;
      frontFace.style.bottom = "0";
      frontFace.style.width = `calc(100% + ${lift}px)`;
      frontFace.style.height = `${side}px`;
      frontFace.style.background =
        `linear-gradient(to bottom, ${shade(colour, -0.22)}, ${shade(colour, -0.5)})`;
      frontFace.style.borderRadius = "0 0 2px 2px";
      wrap.appendChild(frontFace);
    }

    // Top face — the visible lid, shifted up‑left by `lift`.
    const top = document.createElement("div");
    top.style.position = "absolute";
    top.style.left = `${-lift}px`;
    top.style.top = `${-lift}px`;
    top.style.width = "100%";
    top.style.height = "100%";
    top.style.borderRadius = "2px";
    top.style.background = colour;
    top.style.display = "flex";
    top.style.alignItems = "center";
    top.style.justifyContent = "center";
    top.style.fontFamily = '"Share Tech Mono", monospace';
    top.style.fontSize = "0.72rem";
    top.style.color = "#fff";
    top.style.textShadow = "0 1px 2px rgba(0,0,0,0.85)";

    // Shadow: at 70° the shadow is longer and more noticeable.
    top.style.boxShadow =
      `0 ${SHADOW_OFFSET + side * 0.9}px ${SHADOW_BLUR + side * 1.1}px rgba(0,0,0,0.6), ` +
      `inset 0 1px 0 rgba(255,255,255,0.12)`;
    top.style.transition = "top 120ms ease-out, left 120ms ease-out, box-shadow 120ms ease-out";
    top.style.zIndex = "2";

    // Contour lines on the top face.
    for (const s of contourSides(height, map.cols, map.rows, i)) {
      if (s === "top")    top.style.boxShadow += ", inset 0 2px 0 rgba(0,0,0,0.65)";
      if (s === "bottom") top.style.boxShadow += ", inset 0 -2px 0 rgba(0,0,0,0.65)";
      if (s === "left")   top.style.boxShadow += ", inset 2px 0 0 rgba(0,0,0,0.65)";
      if (s === "right")  top.style.boxShadow += ", inset -2px 0 0 rgba(0,0,0,0.65)";
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
    tiles.push({ wrap, top, lift, side });
  }

  // Hover: lift the top face another 3px.
  tiles.forEach(({ wrap, top, lift, side }) => {
    wrap.addEventListener("mouseenter", () => {
      top.style.left = `${-lift - 3}px`;
      top.style.top = `${-lift - 3}px`;
      top.style.boxShadow =
        `0 ${SHADOW_OFFSET + 3 + side * 0.9}px ${SHADOW_BLUR + 3 + side * 1.1}px rgba(0,0,0,0.75), ` +
        `inset 0 1px 0 rgba(255,255,255,0.18)`;
      wrap.style.zIndex = "5";
    });
    wrap.addEventListener("mouseleave", () => {
      top.style.left = `${-lift}px`;
      top.style.top = `${-lift}px`;
      top.style.boxShadow =
        `0 ${SHADOW_OFFSET + side * 0.9}px ${SHADOW_BLUR + side * 1.1}px rgba(0,0,0,0.6), ` +
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