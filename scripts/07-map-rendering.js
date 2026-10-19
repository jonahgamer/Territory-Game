// ═══════════════════════════════════════════════════════════════════
// Map rendering
// ═══════════════════════════════════════════════════════════════════

function mapKindCounts(map) {
  const counts = { problem: 0, obstacle: 0, spawnpoint: 0, empty: 0, math: 0, oi: 0, science: 0, puzzle: 0 };
  for (const cell of map?.cells || []) {
    if (Object.prototype.hasOwnProperty.call(counts, cell.kind)) counts[cell.kind] += 1;
    if (cell.kind === "problem" && Object.prototype.hasOwnProperty.call(counts, cell.type)) counts[cell.type] += 1;
  }
  return counts;
}

function renderMapCounts(map) {
  if (!editorCounts) return;
  if (!map) {
    editorCounts.replaceChildren();
    return;
  }
  const counts = mapKindCounts(map);
  const entries = [
    ["problem", "Problems", counts.problem],
    ["math", "Math", counts.math],
    ["oi", "OI", counts.oi],
    ["science", "Science", counts.science],
    ["puzzle", "Puzzle", counts.puzzle],
    ["obstacle", "Obstacles", counts.obstacle],
    ["spawnpoint", "Spawn points", counts.spawnpoint],
    ["empty", "Empty", counts.empty],
  ];
  editorCounts.replaceChildren();
  for (const [kind, label, value] of entries) {
    const item = document.createElement("span");
    item.className = `map-count map-count-${kind}`;
    const name = document.createElement("span");
    name.textContent = label;
    const count = document.createElement("strong");
    count.textContent = String(value);
    item.append(name, count);
    editorCounts.append(item);
  }
}
function renderMaps() {
  mapList.replaceChildren();
  emptyMessage.hidden = maps.length > 0;
  mapList.hidden = maps.length === 0;
  const groups = [
    ["official", "Official maps"],
    ["testing", "Testing maps"],
  ];
  for (const [mode, title] of groups) {
    const group = maps.filter((map) => mapMode(map) === mode);
    if (group.length === 0) continue;
    const heading = document.createElement("li");
    heading.className = "map-group-label";
    heading.textContent = title;
    mapList.append(heading);
    for (const map of group) mapList.append(mapListItem(map));
  }
}

function mapListItem(map) {
  const item = document.createElement("li");
  const openButton = document.createElement("button");
  const label = document.createElement("span");
  const name = document.createElement("span");
  const size = document.createElement("span");

  openButton.type = "button";
  openButton.className = "open-map";
  openButton.dataset.openId = map.id;
  openButton.setAttribute("aria-label", `Open map ${map.name}`);
  label.className = "map-label";
  name.className = "map-name";
  name.textContent = map.name;
  size.className = "map-size";
  size.textContent = `${map.cols} × ${map.rows} · ${mapMode(map) === "testing" ? "Testing" : "Official"}`;
  label.append(name, size);
  openButton.append(createPreview(map), label);
  item.append(openButton);
  return item;
}

function renderEditor() {
  const map = currentMap();
  if (!map) {
    showMaps();
    setHashSilently("maps");
    return;
  }

  editorTitle.textContent = map.name;
  editorSize.textContent = `${map.cols} × ${map.rows}`;
  renderMapCounts(map);
  editorNameInput.value = map.name;
  renderMapModeButtons(mapModeChoices, mapMode(map));
  deleteOpenMapButton.setAttribute("aria-label", `Delete map ${map.name}`);
  editorGrid.dataset.cols = String(map.cols);
  editorGrid.dataset.rows = String(map.rows);
  layoutMapGrid(editorGrid, map.cols, map.rows);
  editorGrid.replaceChildren();

  map.cells.forEach((cell, index) => {
    const button = document.createElement("button");
    const row = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;

    button.type = "button";
    button.className = cellClassName(cell, "grid-cell");
    button.dataset.index = String(index);
    button.setAttribute("aria-label", cellLabel(cell, row, column));
    button.textContent = cellText(cell);
    editorGrid.append(button);
  });
}

function createPreview(map) {
  const preview = document.createElement("div");
  const showNumbers = map.cols <= 6 && map.rows <= 6;
  preview.className = "map-preview";
  preview.style.gridTemplateColumns = `repeat(${map.cols}, 1fr)`;
  preview.style.gridTemplateRows = `repeat(${map.rows}, 1fr)`;
  if (map.cols > 16 || map.rows > 16) preview.style.gap = "0";

  for (const cell of map.cells) {
    const node = document.createElement("span");
    node.className = cellClassName(cell, "preview-cell");
    if (showNumbers) node.textContent = cellText(cell);
    preview.append(node);
  }
  return preview;
}

function currentMap() {
  return maps.find((map) => map.id === openMapId) || null;
}

function nextProblemNo(type) {
  const used = new Set();
  for (const problem of problems) {
    if (problem.type === type) used.add(problem.index);
  }
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.type === type) used.add(cell.problemNo);
    }
  }
  for (let index = YEAR_INDEX_START; index <= YEAR_INDEX_END; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}

function nextProblemLabel(type) {
  const next = nextProblemNo(type);
  return next === null ? "" : String(next);
}


