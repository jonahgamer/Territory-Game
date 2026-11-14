import { problemDifficulty } from "./difficulty.js";

const TIER_VALUE = { easy: 1, normal: 2, medium: 2, hard: 3, insane: 4 };
const ANCHOR = {
  1: { r: 0x2e, g: 0x7d, b: 0x32 },
  2: { r: 0xf9, g: 0xa8, b: 0x25 },
  3: { r: 0xd3, g: 0x2f, b: 0x2f },
  4: { r: 0x7b, g: 0x1f, b: 0xa2 },
};
const OTHER_COLOURS = {
  obstacle: { r: 0x2c, g: 0x2c, b: 0x3a },
  spawnpoint: { r: 0x0a, g: 0x7e, b: 0xa4 },
  teleport: { r: 0x14, g: 0x5a, b: 0x6e },
  empty: { r: 0x1a, g: 0x1a, b: 0x24 },
  unknown: { r: 0x9e, g: 0x9e, b: 0x9e },
};
const TIER_ANCHOR_STRENGTH = 0.45;
const NEIGHBOUR_WEIGHTS = [
  [-1, -1, 0.5], [0, -1, 1], [1, -1, 0.5],
  [-1, 0, 1], [1, 0, 1],
  [-1, 1, 0.5], [0, 1, 1], [1, 1, 0.5],
];
const SELF_WEIGHT = 2;

export const DIFFICULTY_LEGEND = [
  ["Easy", ANCHOR[1]],
  ["Normal", ANCHOR[2]],
  ["Hard", ANCHOR[3]],
  ["Insane", ANCHOR[4]],
  ["Obstacle", OTHER_COLOURS.obstacle],
  ["Spawn", OTHER_COLOURS.spawnpoint],
  ["Teleport", OTHER_COLOURS.teleport],
  ["Empty", OTHER_COLOURS.empty],
];

export function rgbCss(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

export function difficultyInk(rgb) {
  const lightness = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return lightness > 0.6 ? "#111111" : "#ffffff";
}

export function difficultyTierValues(map, findProblem) {
  return (map.cells || []).map((cell) => {
    if (!cell || cell.kind !== "problem") return null;
    const problem = findProblem(cell.problemNo, cell.type);
    return TIER_VALUE[problemDifficulty(problem)] ?? null;
  });
}

export function difficultyCellPaint(map, index, cell, tierValues, findProblem) {
  const cols = map.cols;
  const rows = map.rows;
  let rgb = OTHER_COLOURS.empty;
  let text = "";
  let title = "Empty";
  if (cell?.kind === "problem") {
    const own = tierValues[index];
    const problem = findProblem(cell.problemNo, cell.type);
    const name = problemDifficulty(problem) || "unknown";
    text = String(cell.problemNo);
    title = `${cell.type} #${cell.problemNo} — ${name}`;
    rgb = own == null ? OTHER_COLOURS.unknown : colourForBlendedValue(blendedTierValue(index, cols, rows, tierValues), own);
  } else if (cell?.kind === "obstacle") {
    rgb = OTHER_COLOURS.obstacle;
    title = "Obstacle";
  } else if (cell?.kind === "spawnpoint") {
    rgb = OTHER_COLOURS.spawnpoint;
    text = "S";
    title = "Spawn point";
  } else if (cell?.kind === "teleport") {
    rgb = OTHER_COLOURS.teleport;
    text = "T";
    title = "Teleport";
  }
  return { background: rgbCss(rgb), color: difficultyInk(rgb), text, title };
}

function blendedTierValue(index, cols, rows, tierValues) {
  const cx = index % cols;
  const cy = Math.floor(index / cols);
  let sum = SELF_WEIGHT * tierValues[index];
  let weightSum = SELF_WEIGHT;
  for (const [dx, dy, weight] of NEIGHBOUR_WEIGHTS) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
    const neighbour = tierValues[ny * cols + nx];
    if (neighbour == null) continue;
    sum += weight * neighbour;
    weightSum += weight;
  }
  return sum / weightSum;
}

function colourForBlendedValue(blended, ownTier) {
  const base = interpolateAnchors(Math.max(1, Math.min(4, blended)));
  return mix(base, ANCHOR[ownTier] || ANCHOR[1], TIER_ANCHOR_STRENGTH);
}

function interpolateAnchors(value) {
  const low = Math.floor(value);
  const high = Math.min(low + 1, 4);
  return mix(ANCHOR[low], ANCHOR[high], value - low);
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
