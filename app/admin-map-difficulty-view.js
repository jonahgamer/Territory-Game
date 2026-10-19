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

// ── Flat, maximally‑distinct difficulty colours ────────────
const BAND_COLOURS = {
  easy:   "#00e676", // vivid emerald
  normal: "#ffea00", // vivid yellow
  hard:   "#ff1744", // vivid crimson
  insane: "#ffffff", // pure white
  empty:  "#0d2818", // dark forest
};

const LEGEND = [
  ["Easy",     BAND_COLOURS.easy],
  ["Normal",   BAND_COLOURS.normal],
  ["Hard",     BAND_COLOURS.hard],
  ["Insane",   BAND_COLOURS.insane],
  ["Obstacle", "#2c2c3a"],
  ["Spawn",    "#0a7ea4"],
  ["Empty",    BAND_COLOURS.empty],
];

// Band boundaries: smoothed height → difficulty band.
function bandFor(h) {
  if (h < 0.75) return "empty";
  if (h < 1.75) return "easy";
  if (h < 2.75) return "normal";
  if (h < 3.75) return "hard";
  return "insane";
}

// Contour lines are drawn at the band boundaries.
const CONTOUR_LEVELS = [0.75, 1.75, 2.75, 3.75];

// ── Hillshade tuning ───────────────────────────────────────
const LIGHT_DIR   = { x: -1, y: -1 }; // light from NW (top-left)
const SHADE_RANGE = 0.30;             // ±30% lightness at strongest slope
const SHADE_PASSES = 2;               // extra blur passes on the shade field

// ── Robust difficulty resolution ───────────────────────────
function resolveDifficulty(cell, problems) {
  if (!cell || cell.kind !== "problem") return null;
  const wantedType = String(cell.type || "").toLowerCase();
  const wantedNo = Number(cell.problemNo);

  let prob = problems.find(
    (p) => Number(p.index) === wantedNo &&
           String(p.type || "").toLowerCase() === wantedType
  );
  if (!prob) {
    prob = problems.find((p) => Number(p.index) === wantedNo);
    if (prob) {
      console.warn(
        `[difficulty-view] cell type "${cell.type}" did not match problem #${wantedNo}; ` +
        `using problem.type "${prob.type}" instead`
      );
    }
  }
  if (!prob) {
    console.warn(
      `[difficulty-view] no problem found for cell #${wantedNo} (type "${cell.type}")`
    );
    return null;
  }

  let diff = null;
  try { diff = problemDifficulty(prob); } catch { /* fall through */ }
  if (!diff || !["easy", "normal", "hard", "insane"].includes(String(diff).toLowerCase())) {
    try { diff = problemDifficulty(prob.difficulty); } catch { /* fall through */ }
  }
  if (!diff || !["easy", "normal", "hard", "insane"].includes(String(diff).toLowerCase())) {
    const raw =
      prob.difficulty ?? prob.diff ?? prob.level ??
      (prob.problem && prob.problem.difficulty) ?? null;
    if (raw && ["easy", "normal", "hard", "insane"].includes(String(raw).toLowerCase())) {
      diff = raw;
    }
  }
  if (!diff) {
    console.warn(
      `[difficulty-view] problem #${wantedNo} (type "${prob.type}") has no resolvable difficulty:`,
      prob
    );
    return null;
  }
  return String(diff).toLowerCase();
}

// ── Height field + smoothing ───────────────────────────────
function buildHeightField(map, problems) {
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
      const diff = resolveDifficulty(cell, problems);
      if (diff) {
        raw[i] = HEIGHT[diff];
        kindOf[i] = diff;
      } else {
        raw[i] = HEIGHT.easy;
        kindOf[i] = "easy";
      }
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

// ── Hillshade field ────────────────────────────────────────
// Compute per‑cell shade multiplier by dotting the height gradient
// with the light direction. Negative gradient (slope facing the
// light) brightens; positive (slope facing away) darkens.
function buildShadeField(height, cols, rows) {
  const n = rows * cols;
  const shade = new Float32Array(n);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const hL = c > 0        ? height[i - 1] : height[i];
      const hR = c < cols - 1 ? height[i + 1] : height[i];
      const hT = r > 0        ? height[i - cols] : height[i];
      const hB = r < rows - 1 ? height[i + cols] : height[i];

      // Central differences → gradient. We also scale by grid spacing
      // implicitly (both directions have same spacing, so slope = Δh).
      const gx = (hR - hL) * 0.5;
      const gy = (hB - hT) * 0.5;

      // Dot with light direction. Light "coming from NW" means the
      // gradient pointing NW (negative gx, negative gy) is lit.
      // Using -gx and -gy so that slopes descending toward the light
      // get positive dot (brighter).
      const dot = (-gx) * LIGHT_DIR.x + (-gy) * LIGHT_DIR.y;

      // Clamp and scale to shade range.
      const s = Math.max(-1, Math.min(1, dot));
      shade[i] = 1 + s * SHADE_RANGE;
    }
  }

  // Blur the shade field so it reads as continuous terrain light,
  // not blocky per‑cell steps. A couple of passes is enough.
  let field = shade;
  for (let iter = 0; iter < SHADE_PASSES; iter++) {
    const next = new Float32Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        let sum = field[i] * 2, count = 2;
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

  return field; // multiplier around 1.0 (±SHADE_RANGE)
}

// ── Colour helpers ─────────────────────────────────────────
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
function rgbToHex({ r, g, b }) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}
function applyShade(hex, multiplier) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({
    r: r * multiplier,
    g: g * multiplier,
    b: b * multiplier,
  });
}
function textColourFor(hex) {
  const { r, g, b } = hexToRgb(hex);
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

  titleEl.textContent = map.name;
  sizeEl.textContent = `${map.cols} × ${map.rows}`;
  modeEl.textContent = (mapMode(map) || "official").replace(/^\w/, (c) => c.toUpperCase());
  renderMapCounts(countsEl, map);

  const { height, kind } = buildHeightField(map, data.problems);
  const shade = buildShadeField(height, map.cols, map.rows);

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
    const band = bandFor(h);

    // Base flat difficulty colour, then modulate by the hillshade.
    let baseColour = BAND_COLOURS[band] || BAND_COLOURS.empty;
    let fillColour = applyShade(baseColour, shade[i]);

    const tile = document.createElement("div");
    tile.className = "grid-cell difficulty-cell";
    tile.style.position = "relative";
    tile.style.aspectRatio = "1 / 1";
    tile.style.background = fillColour;
    tile.style.display = "flex";
    tile.style.alignItems = "center";
    tile.style.justifyContent = "center";
    tile.style.fontFamily = '"Share Tech Mono", monospace';
    tile.style.fontSize = "0.72rem";
    tile.style.fontWeight = "700";
    tile.style.color = textColourFor(fillColour);
    tile.style.boxSizing = "border-box";

    // Contour lines at band boundaries.
    const sides = contourSides(height, map.cols, map.rows, i);
    if (sides.length > 0) {
      const shadows = [];
      for (const s of sides) {
        if (s === "top")    shadows.push("inset 0 2px 0 rgba(0,0,0,0.65)");
        if (s === "bottom") shadows.push("inset 0 -2px 0 rgba(0,0,0,0.65)");
        if (s === "left")   shadows.push("inset 2px 0 0 rgba(0,0,0,0.65)");
        if (s === "right")  shadows.push("inset -2px 0 0 rgba(0,0,0,0.65)");
      }
      tile.style.boxShadow = shadows.join(", ");
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

    tile.title = labelFor(cell, k, row, column, h, band);
    gridEl.appendChild(tile);
  }

  // Faint hairline grid.
  gridEl.style.backgroundImage =
    "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)," +
    "linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)";
  gridEl.style.backgroundSize = `calc(100% / ${map.cols}) calc(100% / ${map.rows})`;

  renderLegend();
}

function labelFor(cell, kind, row, column, h, band) {
  const base = cell
    ? cell.kind === "problem"
      ? `${cell.type} #${cell.problemNo}`
      : cell.kind
    : "empty";
  return `${base} (r${row} c${column}) · band ${band} · elevation ${h.toFixed(2)}`;
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
    sw.style.border = "1px solid rgba(0,0,0,0.4)";
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