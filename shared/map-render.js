import { CELL_SIZE, PROBLEM_TYPES, DIFFICULTIES, DIFFICULTY_SCORE, DIFFICULTY_NAME } from "./constants.js";
import { typeInfo, problemDifficulty, problemTag } from "./difficulty.js";

const mapCellSize = new WeakMap();
const pinchBound = new WeakSet();

export function mapUsesPinch() {
  return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 1100px)").matches;
}

function cellSizeLimits(scroll) {
  const width = Math.max(scroll?.clientWidth || 0, 240);
  const height = Math.max(window.innerHeight || 0, 240);
  const close = Math.min(width, height) / 6;
  return { min: 28, max: Math.max(CELL_SIZE, close) };
}

export function layoutMapGrid(grid, cols, rows) {
  const scroll = grid.closest(".grid-scroll");
  let size = CELL_SIZE;
  if (scroll && mapUsesPinch()) {
    size = mapCellSize.get(grid) || CELL_SIZE;
    mapCellSize.set(grid, size);
    ensurePinch(grid);
  }
  const px = `${size}px`;
  grid.style.setProperty("--cell", px);
  grid.style.gridTemplateColumns = `repeat(${cols}, ${px})`;
  grid.style.gridTemplateRows = `repeat(${rows}, ${px})`;
}

function ensurePinch(grid) {
  const scroll = grid.closest(".grid-scroll");
  if (!scroll || pinchBound.has(scroll)) return;
  pinchBound.add(scroll);
  let startDistance = 0;
  let startSize = CELL_SIZE;
  const distance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroll.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2) return;
    startDistance = distance(event.touches);
    startSize = mapCellSize.get(grid) || CELL_SIZE;
  }, { passive: true });
  scroll.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !startDistance) return;
    event.preventDefault();
    const cols = Number(grid.dataset.cols) || 1;
    const rows = Number(grid.dataset.rows) || 1;
    const limits = cellSizeLimits(scroll);
    const next = Math.min(limits.max, Math.max(limits.min, startSize * (distance(event.touches) / startDistance)));
    mapCellSize.set(grid, next);
    const px = `${next}px`;
    grid.style.setProperty("--cell", px);
    grid.style.gridTemplateColumns = `repeat(${cols}, ${px})`;
    grid.style.gridTemplateRows = `repeat(${rows}, ${px})`;
  }, { passive: false });
  scroll.addEventListener("touchend", (event) => {
    if (event.touches.length < 2) startDistance = 0;
  });
}

export function mapMode(map) {
  return map?.mode === "testing" ? "testing" : "official";
}

export function cellDifficulty(cell, findProblem) {
  return problemDifficulty(findProblem(cell.problemNo, cell.type));
}

export function cellClassName(cell, findProblem, ...extra) {
  const parts = [...extra, cell.kind];
  if (cell.kind === "problem") {
    if (!extra.includes("student-cell")) parts.push(typeInfo(cell.type) ? cell.type : "math");
    parts.push(cellDifficulty(cell, findProblem));
  }
  return parts.join(" ");
}

export function cellText(cell) {
  if (cell.kind === "problem") return problemTag(cell.problemNo, cell.type);
  if (cell.kind === "spawnpoint") return "S";
  return "";
}

export function cellLabel(cell, row, column) {
  if (cell.kind === "problem") return `Row ${row}, column ${column}, problem ${problemTag(cell.problemNo, cell.type)}`;
  if (cell.kind === "obstacle") return `Row ${row}, column ${column}, obstacle`;
  if (cell.kind === "spawnpoint") return `Row ${row}, column ${column}, spawn point`;
  return `Row ${row}, column ${column}, empty`;
}

export function mapKindCounts(map) {
  const counts = { problem: 0, obstacle: 0, spawnpoint: 0, empty: 0, math: 0, oi: 0, science: 0, puzzle: 0, testing: 0 };
  for (const cell of map?.cells || []) {
    if (Object.prototype.hasOwnProperty.call(counts, cell.kind)) counts[cell.kind] += 1;
    if (cell.kind === "problem" && Object.prototype.hasOwnProperty.call(counts, cell.type)) counts[cell.type] += 1;
  }
  return counts;
}

export function renderMapCounts(container, map) {
  if (!container) return;
  if (!map) { container.replaceChildren(); return; }
  const counts = mapKindCounts(map);
  const entries = [
    ["problem", "Problems", counts.problem],
    ["math", "Math", counts.math],
    ["oi", "OI", counts.oi],
    ["science", "Science", counts.science],
    ["puzzle", "Puzzle", counts.puzzle],
    ...(mapMode(map) === "testing" ? [["testing", "Testing", counts.testing]] : []),
    ["obstacle", "Obstacles", counts.obstacle],
    ["spawnpoint", "Spawn points", counts.spawnpoint],
    ["empty", "Empty", counts.empty],
  ];
  container.replaceChildren();
  for (const [kind, label, value] of entries) {
    const item = document.createElement("span");
    item.className = `map-count map-count-${kind}`;
    const name = document.createElement("span");
    name.textContent = label;
    const count = document.createElement("strong");
    count.textContent = String(value);
    item.append(name, count);
    container.append(item);
  }
}

export function emptyCells(count) {
  return Array.from({ length: count }, () => ({ kind: "empty" }));
}