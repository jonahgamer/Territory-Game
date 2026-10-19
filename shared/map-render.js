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

export function mapBackdrop(map) {
  return map?.backdrop === "photo" && typeof map.photo === "string" && map.photo.startsWith("data:image/")
    ? "photo"
    : "terrain";
}

export function photoCover(imgW, imgH, gridW, gridH) {
  const scale = Math.max(gridW / imgW, gridH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  return { drawW, drawH, offsetX: (gridW - drawW) / 2, offsetY: (gridH - drawH) / 2 };
}

export function readMapPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = Math.min(1, 640 / longest);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      let quality = 0.72;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 650000 && quality > 0.4) {
        quality = Math.round((quality - 0.08) * 100) / 100;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (data.length > 650000) reject(new Error("That photo is too large."));
      else resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not an image."));
    };
    img.src = url;
  });
}

export function paintPhotoGrid(grid, map, findProblem) {
  if (!grid) return;
  for (const badge of grid.querySelectorAll(".cell-difficulty")) badge.remove();
  const buttons = [...grid.querySelectorAll(".grid-cell")];
  if (mapBackdrop(map) !== "photo") {
    delete grid.dataset.photoSrc;
    for (const button of buttons) {
      button.classList.remove("photo-cell");
      button.style.backgroundImage = "";
      button.style.backgroundSize = "";
      button.style.backgroundPosition = "";
    }
    return;
  }
  const photo = map.photo;
  const img = new Image();
  img.onload = () => {
    if (!grid.isConnected || grid.dataset.photoSrc !== photo) return;
    const styles = getComputedStyle(grid);
    const cell = parseFloat(styles.getPropertyValue("--cell")) || CELL_SIZE;
    const gap = parseFloat(styles.columnGap) || 0;
    const gridW = map.cols * cell + gap * Math.max(0, map.cols - 1);
    const gridH = map.rows * cell + gap * Math.max(0, map.rows - 1);
    const cover = photoCover(img.naturalWidth, img.naturalHeight, gridW, gridH);
    for (const button of buttons) {
      const index = Number(button.dataset.index);
      if (!Number.isInteger(index)) continue;
      const col = index % map.cols;
      const row = Math.floor(index / map.cols);
      button.classList.add("photo-cell");
      button.style.backgroundImage = `url("${photo}")`;
      button.style.backgroundRepeat = "no-repeat";
      button.style.backgroundSize = `${cover.drawW}px ${cover.drawH}px`;
      button.style.backgroundPosition = `${cover.offsetX - col * (cell + gap)}px ${cover.offsetY - row * (cell + gap)}px`;
      const cellData = map.cells?.[index];
      if (cellData?.kind !== "problem" || !findProblem) continue;
      const difficulty = problemDifficulty(findProblem(cellData.problemNo, cellData.type));
      const badge = document.createElement("span");
      badge.className = `cell-difficulty ${difficulty}`;
      badge.textContent = DIFFICULTY_NAME[difficulty] || "Normal";
      button.append(badge);
    }
  };
  grid.dataset.photoSrc = photo;
  img.src = photo;
}