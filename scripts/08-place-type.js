// ═══════════════════════════════════════════════════════════════════
// Place type
// ═══════════════════════════════════════════════════════════════════

function onPlaceTypeClick(event) {
  const button = event.target.closest("[data-place-type]");
  if (!button || !typeInfo(button.dataset.placeType)) return;
  if (button.dataset.placeType === "testing" && mapMode(currentMap()) !== "testing") return;
  placeType = button.dataset.placeType;
  renderPlaceType();
  if (nextNumberInput.checked) problemNoInput.value = nextProblemLabel(placeType);
}

function renderPlaceType() {
  syncTestingPlaceTools();
  for (const button of placeTypeChoices?.querySelectorAll("[data-place-type]") || []) {
    button.setAttribute("aria-pressed", String(button.dataset.placeType === placeType));
  }
}

function onPlaceModeClick(event) {
  const button = event.target.closest("[data-place-mode]");
  if (!button || (button.dataset.placeMode !== "manual" && button.dataset.placeMode !== "pick")) return;
  placeMode = button.dataset.placeMode;
  renderPlacePick();
}

function onPlacePickTypeClick(event) {
  const button = event.target.closest("[data-pick-type]");
  if (!button || !typeInfo(button.dataset.pickType)) return;
  if (button.dataset.pickType === "testing" && mapMode(currentMap()) !== "testing") return;
  if (placePickTypes.has(button.dataset.pickType)) placePickTypes.delete(button.dataset.pickType);
  else placePickTypes.add(button.dataset.pickType);
  renderPlacePick();
}

function onPlacePickDifficultyClick(event) {
  const button = event.target.closest("[data-pick-difficulty]");
  const difficulty = button?.dataset.pickDifficulty;
  if (!button || !DIFFICULTIES.includes(difficulty)) return;
  if (placePickDifficulties.has(difficulty)) placePickDifficulties.delete(difficulty);
  else placePickDifficulties.add(difficulty);
  renderPlacePick();
}

function onPlacePickSourceClick(event) {
  const button = event.target.closest("[data-pick-source]");
  const source = button?.dataset.pickSource;
  if (!button || !["random", "fixed", "range"].includes(source)) return;
  placePickSource = source;
  renderPlacePick();
}

function renderPlacePick() {
  syncTestingPlaceTools();
  if (placeModeChoices) {
    for (const button of placeModeChoices.querySelectorAll("[data-place-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.placeMode === placeMode));
    }
  }
  if (placeManual) placeManual.hidden = placeMode !== "manual";
  if (placePick) placePick.hidden = placeMode !== "pick";
  if (placePickTypeChoices) {
    for (const button of placePickTypeChoices.querySelectorAll("[data-pick-type]")) {
      button.setAttribute("aria-pressed", String(placePickTypes.has(button.dataset.pickType)));
    }
  }
  if (placePickDifficultyChoices) {
    for (const button of placePickDifficultyChoices.querySelectorAll("[data-pick-difficulty]")) {
      button.setAttribute("aria-pressed", String(placePickDifficulties.has(button.dataset.pickDifficulty)));
    }
  }
  if (placePickSourceChoices) {
    for (const button of placePickSourceChoices.querySelectorAll("[data-pick-source]")) {
      button.setAttribute("aria-pressed", String(button.dataset.pickSource === placePickSource));
    }
  }
  if (placeFixedField) placeFixedField.hidden = placePickSource !== "fixed";
  if (placeRangeField) placeRangeField.hidden = placePickSource !== "range";
}

function syncTestingPlaceTools() {
  const testingMap = mapMode(currentMap()) === "testing";
  if (editorView) editorView.dataset.mapMode = testingMap ? "testing" : "official";
  for (const button of document.querySelectorAll("[data-place-type='testing'], [data-pick-type='testing']")) {
    button.hidden = !testingMap;
  }
  if (!testingMap) {
    placePickTypes.delete("testing");
    if (placeType === "testing") placeType = "math";
  }
}

function mapProblemUseCounts(map) {
  const counts = new Map();
  for (const cell of map?.cells || []) {
    if (cell.kind !== "problem") continue;
    const key = `${cell.type}:${cell.problemNo}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function pickProblemForMap(map) {
  if (placePickTypes.size === 0 || placePickDifficulties.size === 0) {
    return { error: "Choose at least one type and one difficulty." };
  }
  if (mapMode(map) !== "testing" && [...placePickTypes].every((type) => type === "testing")) {
    return { error: "Testing problems can only be placed on a testing map." };
  }
  let pool = problems.filter((problem) => placePickTypes.has(problem.type) && placePickDifficulties.has(problemDifficulty(problem)));
  if (mapMode(map) !== "testing") pool = pool.filter((problem) => problem.type !== "testing");
  if (placePickSource === "fixed") {
    const index = readProblemNo(placeFixedIndex?.value);
    if (index === null) return { error: `Index must be a whole number from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.` };
    pool = pool.filter((problem) => problem.index === index);
  } else if (placePickSource === "range") {
    const from = readProblemNo(placeRangeFrom?.value);
    const to = readProblemNo(placeRangeTo?.value);
    if (from === null || to === null) return { error: `The range must use whole numbers from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.` };
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    pool = pool.filter((problem) => problem.index >= low && problem.index <= high);
  }
  if (pool.length === 0) return { error: "No saved problem matches those types, difficulties, and indexes." };
  const uses = mapProblemUseCounts(map);
  const countOf = (problem) => uses.get(`${problem.type}:${problem.index}`) || 0;
  const unused = pool.filter((problem) => countOf(problem) === 0);
  const source = unused.length > 0 ? unused : pool;
  let lowest = Infinity;
  for (const problem of source) lowest = Math.min(lowest, countOf(problem));
  const tied = source.filter((problem) => countOf(problem) === lowest);
  const chosen = tied[Math.floor(Math.random() * tied.length)];
  return { type: chosen.type, index: chosen.index };
}


