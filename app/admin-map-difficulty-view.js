// /app/admin-map-difficulty-view.js
import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
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

// ── Difficulty tiers ─────────────────────────────────────────
// Numeric value drives the interpolation. Keep these aligned with
// whatever problemDifficulty() returns ("normal" is your "med").
const TIER_VALUE = { easy: 1, normal: 2, medium: 2, hard: 3, insane: 4 };
const VALUE_TIER = ["", "easy", "normal", "hard", "insane"]; // index = value

// Anchor colours at the integer positions 1..4 (easy→insane).
// These are the "obvious" tier colours; blending happens between them.
const ANCHOR = {
  1: { r: 0x2e, g: 0x7d, b: 0x32 }, // easy   green
  2: { r: 0xf9, g: 0xa8, b: 0x25 }, // med    yellow
  3: { r: 0xd3, g: 0x2f, b: 0x2f }, // hard   red
  4: { r: 0x7b, g: 0x1f, b: 0xa2 }, // insane purple
};

// Non‑problem cell colours (flat, not blended).
const OTHER_COLOURS = {
  obstacle:   { r: 0x2c, g: 0x2c, b: 0x3a },
  spawnpoint: { r: 0x0a, g: 0x7e, b: 0xa4 },
  empty:      { r: 0x1a, g: 0x1a, b: 0x24 },
  unknown:    { r: 0x9e, g: 0x9e, b: 0x9e },
};

// How strongly the cell's own tier pulls the final colour back to
// its anchor. 0 = pure neighbour blend, 1 = pure own tier (no shading).
const TIER_ANCHOR_STRENGTH = 0.45;

// Neighbour weights for the 8‑cell ring around a cell.
// Corners count less than orthogonal neighbours.
const NEIGHBOUR_WEIGHTS = [
  [-1, -1, 0.5], [ 0, -1, 1.0], [ 1, -1, 0.5],
  [-1,  0, 1.0],                 [ 1,  0, 1.0],
  [-1,  1, 0.5], [ 0,  1, 1.0], [ 1,  1, 0.5],
];
const SELF_WEIGHT = 2.0;

// ── Main ─────────────────────────────────────────────────────
async function run() {
  if (!mapId) throw new Error("No map selected.");

  const data = await loadPage("page-map", { map: mapId });
  const map = data.map;
  if (!map) throw new Error("That map was not found.");

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

  const { cols, rows } = map;

  // Pre‑compute each problem cell's own tier value (null for non‑problems).
  const tierValues = map.cells.map((cell) => {
    if (!cell || cell.kind !== "problem") return null;
    const prob = findProblem(cell.problemNo, cell.type);
    const diff = problemDifficulty(prob);
    return TIER_VALUE[diff] ?? null;
  });

  map.cells.forEach((cell, index) => {
    if (!cell) return;

    const row    = Math.floor(index / cols) + 1;
    const column = (index % cols) + 1;

    const button = el("button", "grid-cell difficulty-cell", "");
    button.type = "button";
    button.disabled = true;
    button.dataset.index = String(index);
    button.style.aspectRatio = "1 / 1";
    button.style.border = "0";
    button.style.padding = "0";
    button.style.fontFamily = '"Share Tech Mono", monospace';
    button.style.fontSize = "0.85rem";
    button.style.fontWeight = "600";
    button.style.cursor = "default";

    let rgb;
    if (cell.kind === "problem") {
      const own = tierValues[index];
      if (own == null) {
        rgb = OTHER_COLOURS.unknown;
      } else {
        const blended = blendedTierValue(index, cols, rows, tierValues);
        rgb = colourForBlendedValue(blended, own);
      }
    } else if (cell.kind === "obstacle")   rgb = OTHER_COLOURS.obstacle;
    else if (cell.kind === "spawnpoint")   rgb = OTHER_COLOURS.spawnpoint;
    else                                   rgb = OTHER_COLOURS.empty;

    const css = rgbToCss(rgb);
    button.style.background = css;
    button.style.color = isLight(rgb) ? "#111111" : "#ffffff";
    button.style.textShadow = isLight(rgb)
      ? "none"
      : "0 1px 2px rgba(0,0,0,0.55)";

    if (cell.kind === "problem") {
      const prob = findProblem(cell.problemNo, cell.type);
      const diff = problemDifficulty(prob) || "unknown";
      button.textContent = String(cell.problemNo);
      button.title = `${cell.type} #${cell.problemNo} — ${diff}`;
    } else if (cell.kind === "obstacle")   button.title = "Obstacle";
    else if (cell.kind === "spawnpoint")   button.title = "Spawn point";
    else                                   button.title = `Empty (row ${row}, col ${column})`;

    gridEl.append(button);
  });
}

// ── Blending maths ───────────────────────────────────────────
// Weighted average of a cell's own tier value and its 8 neighbours'
// tier values. Non‑problem neighbours are skipped so empties don't
// pull problem colours toward grey.
function blendedTierValue(index, cols, rows, tierValues) {
  const cx = index % cols;
  const cy = Math.floor(index / cols);

  let sum = SELF_WEIGHT * tierValues[index];
  let weightSum = SELF_WEIGHT;

  for (const [dx, dy, w] of NEIGHBOUR_WEIGHTS) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
    const nVal = tierValues[ny * cols + nx];
    if (nVal == null) continue;           // skip non‑problem neighbours
    sum += w * nVal;
    weightSum += w;
  }

  return sum / weightSum;
}

// Turn a blended value in [1,4] into an RGB colour by interpolating
// between anchors, then pull it back toward the cell's own tier anchor
// by TIER_ANCHOR_STRENGTH so the tier stays obvious.
function colourForBlendedValue(blended, ownTier) {
  const base = interpolateAnchors(clamp(blended, 1, 4));
  const anchor = ANCHOR[ownTier] || ANCHOR[1];
  return mix(base, anchor, TIER_ANCHOR_STRENGTH);
}

// Piecewise‑linear interpolation between the four anchor colours.
function interpolateAnchors(v) {
  const lo = Math.floor(v);
  const hi = Math.min(lo + 1, 4);
  const t = v - lo;
  return mix(ANCHOR[lo], ANCHOR[hi], t);
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function rgbToCss({ r, g, b }) {
  return `rgb(${r}, ${g}, ${b})`;
}

// Perceived lightness (Rec. 709) to decide text colour.
function isLight({ r, g, b }) {
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return L > 0.6;
}

// ── Legend ───────────────────────────────────────────────────
function renderLegend() {
  const items = [
    ["Easy",     rgbToCss(ANCHOR[1])],
    ["Med",      rgbToCss(ANCHOR[2])],
    ["Hard",     rgbToCss(ANCHOR[3])],
    ["Insane",   rgbToCss(ANCHOR[4])],
    ["Obstacle", rgbToCss(OTHER_COLOURS.obstacle)],
    ["Spawn",    rgbToCss(OTHER_COLOURS.spawnpoint)],
    ["Empty",    rgbToCss(OTHER_COLOURS.empty)],
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