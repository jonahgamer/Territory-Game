// script.js
// ═══════════════════════════════════════════════════════════════════
// Territory Game — frontend
// All persistence goes through /api/territory
// ═══════════════════════════════════════════════════════════════════

const SESSION_KEY = "territory-game-session";
const MIN_SIZE = 1;
const MAX_SIZE = 40;
const MIN_PROBLEM_NO = 1;
const MAX_PROBLEM_NO = 999;
const PROBLEM_TYPES = [
  { id: "math", name: "Math", tag: "MO" },
  { id: "oi", name: "OI", tag: "OI" },
  { id: "science", name: "Science", tag: "SCI" },
  { id: "puzzle", name: "Puzzle", tag: "PUZ" },
];

const API_BASE = "/api/territory";

const homeButton = document.querySelector("#home-button");
const mapsButton = document.querySelector("#maps-button");
const problemsButton = document.querySelector("#problems-button");
const competitionsButton = document.querySelector("#competitions-button");
const creditsLabel = document.querySelector("#credits-label");
const settingsLabel = document.querySelector("#settings-label");
const accountName = document.querySelector("#account-name");
const accountRole = document.querySelector("#account-role");
const accountPfp = document.querySelector("#account-pfp");
const accountButton = document.querySelector("#account-button");
const homeView = document.querySelector("#home-view");
const homeLead = homeView.querySelector(".lead");
const loadError = document.querySelector("#load-error");
const mapsView = document.querySelector("#maps-view");
const problemsView = document.querySelector("#problems-view");
const problemEditorView = document.querySelector("#problem-editor-view");
const competitionsView = document.querySelector("#competitions-view");
const competitionsLead = document.querySelector("#competitions-lead");
const contestView = document.querySelector("#contest-view");
const editorView = document.querySelector("#editor-view");
const createForm = document.querySelector("#create-map-form");
const mapNameInput = document.querySelector("#map-name");
const colsInput = document.querySelector("#map-cols");
const rowsInput = document.querySelector("#map-rows");
const formError = document.querySelector("#map-form-error");
const emptyMessage = document.querySelector("#map-empty");
const mapList = document.querySelector("#map-list");
const CELL_SIZE = 48;

const backButton = document.querySelector("#back-button");
const deleteOpenMapButton = document.querySelector("#delete-open-map");
const editorTitle = document.querySelector("#editor-title");
const editorSize = document.querySelector("#editor-size");
const editorNameInput = document.querySelector("#map-name-input");
const editorGrid = document.querySelector("#editor-grid");
const kindProblem = document.querySelector("#kind-problem");
const kindObstacle = document.querySelector("#kind-obstacle");
const kindEmpty = document.querySelector("#kind-empty");
const problemOptions = document.querySelector("#problem-options");
const problemNoInput = document.querySelector("#problem-no");
const nextNumberInput = document.querySelector("#next-number");
const problemNoError = document.querySelector("#problem-no-error");
const placeTypeChoices = document.querySelector("#place-type-choices");
const problemSectionChoices = document.querySelector("#problem-section-choices");
const problemSection = document.querySelector("#problem-section");
const problemSectionTitle = document.querySelector("#problem-section-title");
const addProblemButton = document.querySelector("#add-problem");
const problemEmpty = document.querySelector("#problem-empty");
const problemList = document.querySelector("#problem-list");
const problemBackButton = document.querySelector("#problem-back-button");
const deleteOpenProblemButton = document.querySelector("#delete-open-problem");
const problemEditorTitle = document.querySelector("#problem-editor-title");
const problemEditorForm = document.querySelector("#problem-editor-form");
const problemIndexInput = document.querySelector("#problem-index-input");
const problemIndexError = document.querySelector("#problem-index-error");
const problemTypeChoices = document.querySelector("#problem-type-choices");
const problemPrompt = document.querySelector("#problem-prompt");
const problemAnswer = document.querySelector("#problem-answer");
const createContestForm = document.querySelector("#create-contest-form");
const contestNameInput = document.querySelector("#contest-name");
const contestMapSelect = document.querySelector("#contest-map");
const contestFormError = document.querySelector("#contest-form-error");
const contestEmpty = document.querySelector("#contest-empty");
const contestList = document.querySelector("#contest-list");
const contestBackButton = document.querySelector("#contest-back-button");
const deleteOpenContestButton = document.querySelector("#delete-open-contest");
const contestTitle = document.querySelector("#contest-title");
const contestForm = document.querySelector("#contest-form");
const contestNameField = document.querySelector("#contest-name-input");
const contestMapField = document.querySelector("#contest-map-input");
const contestSummary = document.querySelector("#contest-summary");
const contestantEmpty = document.querySelector("#contestant-empty");
const contestantList = document.querySelector("#contestant-list");
const joinContestButton = document.querySelector("#join-contest");
const joinedNote = document.querySelector("#joined-note");
const studentView = document.querySelector("#student-view");
const studentError = document.querySelector("#student-error");
const studentEmpty = document.querySelector("#student-empty");
const studentContestList = document.querySelector("#student-contest-list");
const studentPlayView = document.querySelector("#student-play-view");
const studentBack = document.querySelector("#student-back");
const studentPlayTitle = document.querySelector("#student-play-title");
const studentPlayMeta = document.querySelector("#student-play-meta");
const studentJoin = document.querySelector("#student-join");
const studentJoined = document.querySelector("#student-joined");
const studentBoard = document.querySelector("#student-board");
const studentGrid = document.querySelector("#student-grid");
const studentProblem = document.querySelector("#student-problem");
const studentProblemTag = document.querySelector("#student-problem-tag");
const studentProblemPrompt = document.querySelector("#student-problem-prompt");

// ═══════════════════════════════════════════════════════════════════
// In-memory state (populated by bootstrap)
// ═══════════════════════════════════════════════════════════════════

let problems = [];
let maps = [];
let contests = [];
let session = readStoredSession();
let bootstrapped = false;
let openMapId = null;
let openContestId = null;
let paintKind = "problem";
let painting = false;
let paintedThisStroke = new Set();
let strokeCount = 0;
let pendingProblemOpen = null;
let editingProblemNo = null;
let editingProblemType = null;
let problemReturn = "list";
let activeProblemType = null;
let placeType = "math";

// ═══════════════════════════════════════════════════════════════════
// API layer
// ═══════════════════════════════════════════════════════════════════

async function apiCall(action, body) {
  const headers = { "Content-Type": "application/json" };
  if (session?.token) headers["Authorization"] = `Bearer ${session.token}`;

  const isPost = !!body;
  const url = isPost ? API_BASE : `${API_BASE}?action=${encodeURIComponent(action)}`;

  const r = await fetch(url, {
    method: isPost ? "POST" : "GET",
    headers,
    body: isPost ? JSON.stringify({ action, ...body }) : undefined,
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
  return data;
}

function debounce(fn, ms = 500) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const _persistMapsDebounced = debounce(
  () => apiCall("save-maps", { maps }).catch(e => console.error("[save-maps]", e)),
  600
);
const _persistProblemsDebounced = debounce(
  () => apiCall("save-problems", { problems }).catch(e => console.error("[save-problems]", e)),
  600
);
const _persistContestsDebounced = debounce(
  () => apiCall("save-contests", { contests }).catch(e => console.error("[save-contests]", e)),
  600
);

// ═══════════════════════════════════════════════════════════════════
// Event wiring
// ═══════════════════════════════════════════════════════════════════

homeButton.addEventListener("click", showHome);
mapsButton.addEventListener("click", showMaps);
problemsButton.addEventListener("click", showProblems);
competitionsButton.addEventListener("click", showCompetitions);
accountButton.addEventListener("click", logOut);
createContestForm.addEventListener("submit", createContest);
contestList.addEventListener("click", onContestListClick);
contestBackButton.addEventListener("click", showCompetitions);
deleteOpenContestButton.addEventListener("click", deleteOpenContest);
contestForm.addEventListener("submit", (event) => event.preventDefault());
contestNameField.addEventListener("input", commitContestName);
contestNameField.addEventListener("change", () => {
  const contest = currentContest();
  if (contest && !readContestName(contestNameField.value)) contestNameField.value = contest.name;
});
contestMapField.addEventListener("change", commitContestMap);
contestantList.addEventListener("click", onContestantListClick);
studentContestList.addEventListener("click", onStudentListClick);
studentBack.addEventListener("click", showStudent);
studentJoin.addEventListener("click", () => joinContest(openContestId));
studentGrid.addEventListener("click", onStudentGridClick);
joinContestButton.addEventListener("click", () => joinContest(openContestId));
problemSectionChoices.addEventListener("click", onProblemSectionClick);
problemSection.addEventListener("click", onProblemListClick);
placeTypeChoices.addEventListener("click", onPlaceTypeClick);
problemBackButton.addEventListener("click", closeProblemEditor);
deleteOpenProblemButton.addEventListener("click", () => deleteProblem(editingProblemNo, editingProblemType));
problemEditorForm.addEventListener("submit", (event) => event.preventDefault());
problemIndexInput.addEventListener("change", commitProblemIndex);
problemIndexInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    problemIndexInput.blur();
  }
});
problemTypeChoices.addEventListener("click", (event) => {
  const button = event.target.closest("[data-problem-type]");
  if (!button || editingProblemNo === null) return;
  setProblemType(editingProblemNo, button.dataset.problemType);
});
problemPrompt.addEventListener("input", () => {
  updateProblemField("prompt", problemPrompt.value);
  requestAnimationFrame(renderProblemPreview);
});
problemAnswer.addEventListener("input", () => {
  updateProblemField("answer", problemAnswer.value);
  requestAnimationFrame(renderProblemPreview);
});
backButton.addEventListener("click", showMaps);
deleteOpenMapButton.addEventListener("click", deleteOpenMap);
createForm.addEventListener("submit", createMap);
editorNameInput.addEventListener("input", commitMapName);
editorNameInput.addEventListener("change", () => {
  const map = currentMap();
  if (map && !readMapName(editorNameInput.value)) editorNameInput.value = map.name;
});
mapList.addEventListener("click", onMapListClick);
kindProblem.addEventListener("click", () => chooseTool("problem"));
kindObstacle.addEventListener("click", () => chooseTool("obstacle"));
kindEmpty.addEventListener("click", () => chooseTool("empty"));
editorGrid.addEventListener("pointerdown", startPaint);
problemNoInput.addEventListener("input", () => {
  problemNoError.hidden = true;
});

// ═══════════════════════════════════════════════════════════════════
// Persistence
// ═══════════════════════════════════════════════════════════════════

function persistMaps() {
  if (!bootstrapped || !isAdmin()) return;
  _persistMapsDebounced();
}

function persistProblems() {
  if (!bootstrapped || !isAdmin()) return;
  _persistProblemsDebounced();
}

function persistContests() {
  if (!bootstrapped || !isAdmin()) return;
  _persistContestsDebounced();
}

// ═══════════════════════════════════════════════════════════════════
// Views
// ═══════════════════════════════════════════════════════════════════

function showHome() {
  if (!requireSession()) return;
  if (isContestant()) {
    showStudent();
    return;
  }
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  homeView.hidden = false;
  updateHomeLead();
  setCurrentSection(null);
}

function showMaps() {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  mapsView.hidden = false;
  setCurrentSection(mapsButton);
  renderMaps();
}

function showProblems() {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  problemsView.hidden = false;
  setCurrentSection(problemsButton);
  renderProblems();
}

function showEditor(mapId, options = {}) {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  stopPaint();
  openMapId = mapId;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  editorView.hidden = false;
  setCurrentSection(mapsButton);
  if (!options.keepTool) {
    chooseTool("problem");
    problemNoInput.value = String(nextProblemNo(placeType));
  }
  problemNoError.hidden = true;
  renderEditor();
}

function hideViews() {
  homeView.hidden = true;
  mapsView.hidden = true;
  problemsView.hidden = true;
  problemEditorView.hidden = true;
  competitionsView.hidden = true;
  contestView.hidden = true;
  studentView.hidden = true;
  studentPlayView.hidden = true;
  editorView.hidden = true;
}

function setCurrentSection(button) {
  mapsButton.removeAttribute("aria-current");
  problemsButton.removeAttribute("aria-current");
  competitionsButton.removeAttribute("aria-current");
  if (button) button.setAttribute("aria-current", "page");
}

// ═══════════════════════════════════════════════════════════════════
// Map CRUD
// ═══════════════════════════════════════════════════════════════════

function deleteOpenMap() {
  maps = maps.filter((map) => map.id !== openMapId);
  persistMaps();
  showMaps();
}

function createMap(event) {
  event.preventDefault();
  const name = readMapName(mapNameInput.value);
  const cols = readSize(colsInput.value);
  const rows = readSize(rowsInput.value);

  if (!name) {
    formError.hidden = false;
    formError.textContent = "Give the map a name.";
    return;
  }
  if (cols === null || rows === null) {
    formError.hidden = false;
    formError.textContent = `Width and height must be whole numbers from ${MIN_SIZE} to ${MAX_SIZE}.`;
    return;
  }

  formError.hidden = true;
  maps.unshift({
    id: crypto.randomUUID(),
    name,
    cols,
    rows,
    cells: emptyCells(cols * rows),
  });
  persistMaps();
  mapNameInput.value = "";
  renderMaps();
}

function commitMapName() {
  const map = currentMap();
  if (!map) return;
  const name = readMapName(editorNameInput.value);
  if (!name) return;
  map.name = name;
  editorTitle.textContent = name;
  deleteOpenMapButton.setAttribute("aria-label", `Delete map ${name}`);
  persistMaps();
}

function onMapListClick(event) {
  const openButton = event.target.closest("[data-open-id]");
  if (openButton) showEditor(openButton.dataset.openId);
}

// ═══════════════════════════════════════════════════════════════════
// Painting
// ═══════════════════════════════════════════════════════════════════

function chooseTool(kind) {
  paintKind = kind;
  kindProblem.setAttribute("aria-pressed", String(kind === "problem"));
  kindObstacle.setAttribute("aria-pressed", String(kind === "obstacle"));
  kindEmpty.setAttribute("aria-pressed", String(kind === "empty"));
  problemOptions.hidden = kind !== "problem";
}

function startPaint(event) {
  const index = cellIndexFromTarget(event.target);
  if (index === null) return;

  event.preventDefault();
  painting = true;
  strokeCount = 0;
  pendingProblemOpen = null;
  paintedThisStroke = new Set();
  window.addEventListener("pointermove", continuePaint);
  window.addEventListener("pointerup", stopPaint);
  window.addEventListener("pointercancel", stopPaint);
  applyTool(index, "toggle");
}

function continuePaint(event) {
  if (!painting) return;
  const index = cellIndexFromPoint(event.clientX, event.clientY);
  if (index === null) return;
  applyTool(index, "toggle");
}

function stopPaint() {
  if (!painting) return;
  const openNo = strokeCount === 1 ? pendingProblemOpen : null;
  painting = false;
  strokeCount = 0;
  pendingProblemOpen = null;
  paintedThisStroke = new Set();
  window.removeEventListener("pointermove", continuePaint);
  window.removeEventListener("pointerup", stopPaint);
  window.removeEventListener("pointercancel", stopPaint);
  if (openNo) showProblemEditor(openNo.index, openNo.type, true);
}

function applyTool(index, mode) {
  if (paintedThisStroke.has(index)) return;

  const map = currentMap();
  if (!map) return;

  const cell = map.cells[index];
  if (paintKind === "problem" && cell.kind === "problem") {
    paintedThisStroke.add(index);
    strokeCount += 1;
    pendingProblemOpen = { index: cell.problemNo, type: cell.type };
    return;
  }

  if (mode === "toggle" && cell.kind !== "empty") {
    paintedThisStroke.add(index);
    strokeCount += 1;
    map.cells[index] = { kind: "empty" };
    paintCell(map, index);
    persistMaps();
    return;
  }

  if (paintKind === "problem") {
    const problemNo = readProblemNo(problemNoInput.value);
    if (problemNo === null) {
      problemNoError.hidden = false;
      problemNoError.textContent = `Problem no. must be a whole number from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.`;
      stopPaint();
      return;
    }

    problemNoError.hidden = true;
    paintedThisStroke.add(index);
    strokeCount += 1;
    map.cells[index] = { kind: "problem", problemNo, type: placeType };
    ensureProblem(problemNo, placeType);
    paintCell(map, index);
    persistMaps();
    if (nextNumberInput.checked && problemNo < MAX_PROBLEM_NO) {
      problemNoInput.value = String(problemNo + 1);
    }
    return;
  }

  paintedThisStroke.add(index);
  strokeCount += 1;
  map.cells[index] = paintKind === "obstacle" ? { kind: "obstacle" } : { kind: "empty" };
  paintCell(map, index);
  persistMaps();
}

function paintCell(map, index) {
  const button = editorGrid.querySelector(`[data-index="${index}"]`);
  if (!button) return;

  const cell = map.cells[index];
  const row = Math.floor(index / map.cols) + 1;
  const column = (index % map.cols) + 1;
  button.className = `grid-cell ${cell.kind}`;
  button.textContent = cell.kind === "problem" ? problemTag(cell.problemNo, cell.type) : "";
  button.setAttribute("aria-label", cellLabel(cell, row, column));
}

function cellIndexFromTarget(target) {
  const cell = target.closest?.("[data-index]");
  if (!cell || !editorGrid.contains(cell)) return null;
  return Number(cell.dataset.index);
}

function cellIndexFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  return cellIndexFromTarget(element);
}

// ═══════════════════════════════════════════════════════════════════
// Map rendering
// ═══════════════════════════════════════════════════════════════════

function renderMaps() {
  mapList.replaceChildren();
  emptyMessage.hidden = maps.length > 0;
  mapList.hidden = maps.length === 0;

  for (const map of maps) {
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
    size.textContent = `${map.cols} × ${map.rows}`;
    label.append(name, size);
    openButton.append(createPreview(map), label);
    item.append(openButton);
    mapList.append(item);
  }
}

function renderEditor() {
  const map = currentMap();
  if (!map) { showMaps(); return; }

  editorTitle.textContent = map.name;
  editorSize.textContent = `${map.cols} × ${map.rows}`;
  editorNameInput.value = map.name;
  deleteOpenMapButton.setAttribute("aria-label", `Delete map ${map.name}`);
  editorGrid.style.gridTemplateColumns = `repeat(${map.cols}, ${CELL_SIZE}px)`;
  editorGrid.style.gridTemplateRows = `repeat(${map.rows}, ${CELL_SIZE}px)`;
  editorGrid.replaceChildren();

  map.cells.forEach((cell, index) => {
    const button = document.createElement("button");
    const row = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;

    button.type = "button";
    button.className = `grid-cell ${cell.kind}`;
    button.dataset.index = String(index);
    button.setAttribute("aria-label", cellLabel(cell, row, column));
    if (cell.kind === "problem") button.textContent = problemTag(cell.problemNo, cell.type);
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
    node.className = `preview-cell ${cell.kind}`;
    if (cell.kind === "problem" && showNumbers) node.textContent = problemTag(cell.problemNo, cell.type);
    preview.append(node);
  }
  return preview;
}

function currentMap() {
  return maps.find((map) => map.id === openMapId) || null;
}

function nextProblemNo(type) {
  let max = 0;
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.type === type) max = Math.max(max, cell.problemNo);
    }
  }
  for (const problem of problems) {
    if (problem.type === type) max = Math.max(max, problem.index);
  }
  return max >= MAX_PROBLEM_NO ? MIN_PROBLEM_NO : max + 1;
}

// ═══════════════════════════════════════════════════════════════════
// Place type
// ═══════════════════════════════════════════════════════════════════

function onPlaceTypeClick(event) {
  const button = event.target.closest("[data-place-type]");
  if (!button || !typeInfo(button.dataset.placeType)) return;
  placeType = button.dataset.placeType;
  renderPlaceType();
  if (nextNumberInput.checked) problemNoInput.value = String(nextProblemNo(placeType));
}

function renderPlaceType() {
  for (const button of placeTypeChoices.querySelectorAll("[data-place-type]")) {
    button.setAttribute("aria-pressed", String(button.dataset.placeType === placeType));
  }
}

// ═══════════════════════════════════════════════════════════════════
// Problems
// ═══════════════════════════════════════════════════════════════════

function onProblemSectionClick(event) {
  const button = event.target.closest("[data-section]");
  if (!button || !typeInfo(button.dataset.section)) return;
  activeProblemType = button.dataset.section;
  renderProblems();
}

function addProblem(type) {
  const problemType = typeInfo(type) ? type : "math";
  const index = nextProblemNo(problemType);
  const problem = blankProblem(index);
  problem.type = problemType;
  problems.push(problem);
  problems.sort(compareProblems);
  persistProblems();
  showProblemEditor(index, problemType, false);
}

function onProblemListClick(event) {
  if (event.target.closest("#add-problem")) {
    if (activeProblemType) addProblem(activeProblemType);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-problem]");
  if (deleteButton) {
    deleteProblem(Number(deleteButton.dataset.deleteProblem), deleteButton.dataset.deleteType);
    return;
  }

  const openButton = event.target.closest("[data-open-problem]");
  if (openButton) showProblemEditor(Number(openButton.dataset.openProblem), openButton.dataset.openType, false);
}

function showProblemEditor(index, type, fromMap) {
  const problemType = typeInfo(type) ? type : "math";
  ensureProblem(index, problemType);
  stopPaint();
  if (!fromMap) openMapId = null;
  openContestId = null;
  editingProblemNo = index;
  editingProblemType = problemType;
  problemReturn = fromMap ? "map" : "list";
  hideViews();
  problemEditorView.hidden = false;
  setCurrentSection(problemsButton);
  renderProblemEditor();
  problemPrompt.focus();
}

function closeProblemEditor() {
  const mapId = openMapId;
  if (problemReturn === "map" && mapId && maps.some((map) => map.id === mapId)) {
    showEditor(mapId, { keepTool: true });
    return;
  }
  const problem = findProblem(editingProblemNo, editingProblemType);
  if (problem) activeProblemType = problem.type;
  showProblems();
}

function commitProblemIndex() {
  const next = readProblemNo(problemIndexInput.value);
  if (next === null) {
    problemIndexError.hidden = false;
    problemIndexError.textContent = `Index must be a whole number from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.`;
    problemIndexInput.value = String(editingProblemNo);
    return;
  }

  problemIndexError.hidden = true;
  if (next === editingProblemNo) return;
  if (!reindexProblem(editingProblemNo, next)) {
    problemIndexInput.value = String(editingProblemNo);
    return;
  }

  editingProblemNo = next;
  renderProblemEditor();
}

function reindexProblem(oldIndex, newIndex) {
  const moving = findProblem(oldIndex, editingProblemType);
  if (!moving) return false;

  const other = findProblem(newIndex, moving.type);
  if (other) {
    const movingTag = problemTag(oldIndex, moving.type);
    const otherTag = problemTag(newIndex, other.type);
    const movingNext = problemTag(newIndex, moving.type);
    const otherNext = problemTag(oldIndex, other.type);
    const typeName = typeInfo(moving.type).name;
    const first = window.confirm(
      `${otherTag} already belongs to another ${typeName} problem. Swap it with ${movingTag}?`
    );
    if (!first) return false;
    const second = window.confirm(
      `Swap these indexes? ${movingTag} becomes ${movingNext}, and ${otherTag} becomes ${otherNext}.`
    );
    if (!second) return false;
    other.index = oldIndex;
    moving.index = newIndex;
    swapProblemNumbersOnMaps(oldIndex, newIndex, moving.type);
  } else {
    moving.index = newIndex;
    renameProblemOnMaps(oldIndex, newIndex, moving.type);
  }

  problems.sort(compareProblems);
  persistProblems();
  persistMaps();
  return true;
}

function renameProblemOnMaps(oldIndex, newIndex, type) {
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.type === type && cell.problemNo === oldIndex) {
        cell.problemNo = newIndex;
      }
    }
  }
}

function swapProblemNumbersOnMaps(first, second, type) {
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind !== "problem" || cell.type !== type) continue;
      if (cell.problemNo === first) cell.problemNo = second;
      else if (cell.problemNo === second) cell.problemNo = first;
    }
  }
}

function renameProblemTypeOnMaps(index, oldType, newType) {
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.problemNo === index && cell.type === oldType) {
        cell.type = newType;
      }
    }
  }
}

function swapProblemTypesOnMaps(index, firstType, secondType) {
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind !== "problem" || cell.problemNo !== index) continue;
      if (cell.type === firstType) cell.type = secondType;
      else if (cell.type === secondType) cell.type = firstType;
    }
  }
}

function setProblemType(index, type) {
  const problem = findProblem(index, editingProblemType);
  if (!problem || !typeInfo(type) || problem.type === type) return;

  const other = findProblem(problem.index, type);
  if (other) {
    const movingTag = problemTag(problem.index, problem.type);
    const otherTag = problemTag(other.index, other.type);
    const movingNext = problemTag(problem.index, type);
    const otherNext = problemTag(other.index, problem.type);
    const first = window.confirm(
      `${otherTag} already belongs to another ${typeInfo(type).name} problem. Swap types with ${movingTag}?`
    );
    if (!first) return;
    const second = window.confirm(
      `Swap these types? ${movingTag} becomes ${movingNext}, and ${otherTag} becomes ${otherNext}.`
    );
    if (!second) return;
    const oldType = problem.type;
    problem.type = type;
    other.type = oldType;
    swapProblemTypesOnMaps(problem.index, oldType, type);
  } else {
    const oldType = problem.type;
    problem.type = type;
    renameProblemTypeOnMaps(problem.index, oldType, type);
  }

  editingProblemType = type;
  problems.sort(compareProblems);
  persistProblems();
  persistMaps();
  if (problemEditorView.hidden) renderProblems();
  else renderProblemEditor();
}

function updateProblemField(field, value) {
  const problem = findProblem(editingProblemNo, editingProblemType);
  if (!problem || (field !== "prompt" && field !== "answer")) return;
  problem[field] = value;
  persistProblems();
}

function deleteProblem(index, type) {
  const wasOpen = editingProblemNo === index && editingProblemType === type;
  problems = problems.filter((problem) => !(problem.index === index && problem.type === type));
  for (const map of maps) {
    map.cells.forEach((cell, cellIndex) => {
      if (cell.kind === "problem" && cell.problemNo === index && cell.type === type) {
        map.cells[cellIndex] = { kind: "empty" };
      }
    });
  }
  if (wasOpen) {
    editingProblemNo = null;
    editingProblemType = null;
  }
  persistProblems();
  persistMaps();
  if (wasOpen) showProblems();
  else renderProblems();
}

function ensureProblem(index, type) {
  const problemType = typeInfo(type) ? type : "math";
  if (findProblem(index, problemType)) return;
  const problem = blankProblem(index);
  problem.type = problemType;
  problems.push(problem);
  problems.sort(compareProblems);
  persistProblems();
}

function compareProblems(a, b) {
  return a.index - b.index || a.type.localeCompare(b.type);
}

function renderProblems() {
  for (const button of problemSectionChoices.querySelectorAll("[data-section]")) {
    button.setAttribute("aria-pressed", String(button.dataset.section === activeProblemType));
  }

  const type = typeInfo(activeProblemType);
  if (!type) {
    problemSection.hidden = true;
    return;
  }

  const items = problems.filter((problem) => problem.type === type.id);
  problemSection.hidden = false;
  problemSectionTitle.textContent = type.name;
  const tag = document.createElement("span");
  tag.className = "problem-tag";
  tag.textContent = type.tag;
  problemSectionTitle.append(tag);
  addProblemButton.setAttribute("aria-label", `Add ${type.name} problem`);
  problemList.replaceChildren();
  for (const problem of items) problemList.append(createProblemEntity(problem));
  problemEmpty.hidden = items.length > 0;
  problemEmpty.textContent = `No ${type.name} problems yet.`;
  problemList.hidden = items.length === 0;
}

function createProblemEntity(problem) {
  const item = document.createElement("li");
  const openButton = document.createElement("button");
  const index = document.createElement("span");
  const snippet = document.createElement("span");
  const deleteButton = document.createElement("button");
  const tag = problemTag(problem.index, problem.type);

  item.dataset.problemIndex = String(problem.index);
  openButton.type = "button";
  openButton.className = "open-problem";
  openButton.dataset.openProblem = String(problem.index);
  openButton.dataset.openType = problem.type;
  openButton.setAttribute("aria-label", `Edit ${tag}`);
  index.className = "problem-index";
  index.textContent = tag;
  snippet.className = "problem-snippet";
  snippet.textContent = problemSnippet(problem);
  openButton.append(index, snippet);

  deleteButton.type = "button";
  deleteButton.className = "delete-map";
  deleteButton.dataset.deleteProblem = String(problem.index);
  deleteButton.dataset.deleteType = problem.type;
  deleteButton.textContent = "Delete";
  deleteButton.setAttribute("aria-label", `Delete ${tag}`);

  item.append(openButton, deleteButton);
  return item;
}

function problemSnippet(problem) {
  const raw = (problem.prompt || "").trim();
  if (!raw) return "No text yet";
  // Strip tags for list display
  const div = document.createElement("div");
  div.innerHTML = raw;
  const text = (div.textContent || "").replace(/\s+/g, " ").trim();
  return text || "(empty)";
}

function renderProblemEditor() {
  const problem = findProblem(editingProblemNo, editingProblemType);
  if (!problem) { showProblems(); return; }

  const tag = problemTag(problem.index, problem.type);
  problemEditorTitle.textContent = tag;
  problemBackButton.textContent = problemReturn === "map" ? "Back to map" : "Back to problems";
  deleteOpenProblemButton.setAttribute("aria-label", `Delete ${tag}`);
  problemIndexInput.value = String(problem.index);
  problemIndexError.hidden = true;
  for (const button of problemTypeChoices.querySelectorAll("[data-problem-type]")) {
    button.setAttribute("aria-pressed", String(button.dataset.problemType === problem.type));
  }
  problemPrompt.value = problem.prompt;
  problemAnswer.value = problem.answer;

  // Render HTML preview
  requestAnimationFrame(renderProblemPreview);
}

// ═══════════════════════════════════════════════════════════════════
// HTML preview for problem fields
// ═══════════════════════════════════════════════════════════════════

function renderProblemPreview() {
  if (!problemEditorForm) return;

  let previewEl = document.querySelector("#problem-preview");
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.id = "problem-preview";
    previewEl.className = "problem-preview";
    problemEditorForm.appendChild(previewEl);
  }
  previewEl.innerHTML = "";

  const promptHtml = (problemPrompt.value || "").trim();
  const answerHtml = (problemAnswer.value || "").trim();

  if (!promptHtml && !answerHtml) {
    previewEl.hidden = true;
    return;
  }
  previewEl.hidden = false;

  const box = document.createElement("div");
  box.className = "problem-preview-box";

  if (promptHtml) {
    const title = document.createElement("div");
    title.className = "problem-preview-title";
    title.textContent = "Prompt — preview";
    const content = document.createElement("div");
    content.className = "problem-preview-content";
    content.innerHTML = promptHtml;
    box.append(title, content);
  }

  if (answerHtml) {
    const title = document.createElement("div");
    title.className = "problem-preview-title";
    title.textContent = "Answer — preview";
    const content = document.createElement("div");
    content.className = "problem-preview-content";
    content.innerHTML = answerHtml;
    box.append(title, content);
  }

  previewEl.appendChild(box);
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function typeInfo(type) {
  return PROBLEM_TYPES.find((item) => item.id === type) || null;
}

function problemTag(index, type) {
  const info = typeInfo(type) || typeInfo("math");
  return `${info.tag}${index}`;
}

function findProblem(index, type) {
  return problems.find((problem) => problem.index === index && problem.type === type) || null;
}

function blankProblem(index) {
  return { index, type: "math", prompt: "", answer: "" };
}

function cellLabel(cell, row, column) {
  if (cell.kind === "problem") return `Row ${row}, column ${column}, problem ${problemTag(cell.problemNo, cell.type)}`;
  if (cell.kind === "obstacle") return `Row ${row}, column ${column}, obstacle`;
  return `Row ${row}, column ${column}, empty`;
}

function emptyCells(count) {
  return Array.from({ length: count }, () => ({ kind: "empty" }));
}

function readSize(value) {
  const size = Number(value);
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) return null;
  return size;
}

function readProblemNo(value) {
  const problemNo = Number(value);
  if (!Number.isInteger(problemNo) || problemNo < MIN_PROBLEM_NO || problemNo > MAX_PROBLEM_NO) {
    return null;
  }
  return problemNo;
}

// ═══════════════════════════════════════════════════════════════════
// Session
// ═══════════════════════════════════════════════════════════════════

function isSignedIn() {
  return Boolean(session?.user?.username && session.token);
}

function isAdmin() {
  return session?.user?.role === "admin";
}

function isContestant() {
  return isSignedIn() && !isAdmin();
}

function contestantId() {
  return session?.user?.username || "";
}

function requireSession() {
  if (isSignedIn()) return true;
  location.replace("login.html");
  return false;
}

function applyAccount() {
  if (!isSignedIn()) {
    location.replace("login.html");
    return;
  }

  const contestant = isContestant();
  const user = session.user;
  mapsButton.hidden = contestant;
  problemsButton.hidden = contestant;
  creditsLabel.hidden = contestant;
  settingsLabel.hidden = contestant;
  competitionsButton.textContent = contestant ? "Contests" : "Competition";
  accountRole.textContent = user.role === "admin" ? "Admin" : "Student";
  const pfp = safePfp(user.pfp);
  accountPfp.hidden = !pfp;
  accountPfp.src = pfp;
  updateHomeLead();
}

function updateHomeLead() {
  const user = session?.user;
  homeLead.textContent = isContestant()
    ? `Signed in as ${user.displayName || user.username}. Open Contests to join one and read the problems.`
    : "Welcome to Territory Game.";
}

function logOut() {
  session = null;
  persistSession();
  location.replace("login.html");
}

// ═══════════════════════════════════════════════════════════════════
// Contests
// ═══════════════════════════════════════════════════════════════════

function showCompetitions() {
  if (!requireSession()) return;
  if (isContestant()) {
    showStudent();
    return;
  }
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  competitionsView.hidden = false;
  setCurrentSection(competitionsButton);
  renderCompetitions();
}

function showContest(contestId) {
  stopPaint();
  openMapId = null;
  openContestId = contestId;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  contestView.hidden = false;
  setCurrentSection(competitionsButton);
  renderContest();
}

function createContest(event) {
  event.preventDefault();
  if (isContestant()) return;
  const name = readContestName(contestNameInput.value);
  if (!name) {
    contestFormError.hidden = false;
    contestFormError.textContent = "Give the contest a name.";
    return;
  }
  if (maps.length === 0) {
    contestFormError.hidden = false;
    contestFormError.textContent = "Create a map before starting a contest.";
    return;
  }
  const mapId = contestMapSelect.value;
  if (!maps.some((map) => map.id === mapId)) {
    contestFormError.hidden = false;
    contestFormError.textContent = "Choose a map for this contest.";
    return;
  }
  contestFormError.hidden = true;
  contests.unshift({
    id: crypto.randomUUID(),
    name,
    mapId,
    contestantIds: [],
  });
  persistContests();
  contestNameInput.value = "";
  renderCompetitions();
}

function onContestListClick(event) {
  const joinButton = event.target.closest("[data-join-id]");
  if (joinButton) {
    joinContest(joinButton.dataset.joinId);
    return;
  }
  const openButton = event.target.closest("[data-open-contest]");
  if (openButton) showContest(openButton.dataset.openContest);
}

function deleteOpenContest() {
  if (isContestant()) return;
  contests = contests.filter((contest) => contest.id !== openContestId);
  persistContests();
  showCompetitions();
}

function commitContestName() {
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const name = readContestName(contestNameField.value);
  if (!name) return;
  contest.name = name;
  contestTitle.textContent = name;
  persistContests();
}

function commitContestMap() {
  const contest = currentContest();
  if (!contest || isContestant()) return;
  if (!maps.some((map) => map.id === contestMapField.value)) return;
  contest.mapId = contestMapField.value;
  persistContests();
}

async function onContestantListClick(event) {
  const button = event.target.closest("[data-remove-contestant]");
  if (!button || isContestant()) return;
  const contest = currentContest();
  if (!contest) return;
  const removed = button.dataset.removeContestant;
  const previous = contest.contestantIds.slice();
  contest.contestantIds = previous.filter((id) => id !== removed);
  renderContest();
  try {
    await apiCall("remove-contestant", { contestId: contest.id, contestantId: removed });
  } catch (error) {
    contest.contestantIds = previous;
    renderContest();
    alert(`Could not remove ${removed}: ${error.message}`);
  }
}

async function joinContest(contestId) {
  if (!isContestant()) return;
  const contest = contests.find((item) => item.id === contestId);
  if (!contest || contest.contestantIds.includes(contestantId())) return;

  // Optimistic local update
  contest.contestantIds.push(contestantId());
  if (openContestId === contestId) renderContest();
  else renderCompetitions();

  try {
    await apiCall("join-contest", { contestId });
  } catch (e) {
    contest.contestantIds = contest.contestantIds.filter((id) => id !== contestantId());
    alert("Failed to join contest: " + e.message);
  }
  refreshOpenContest();
}

function refreshOpenContest() {
  if (!studentPlayView.hidden) renderStudentPlay();
  else if (!studentView.hidden) renderStudent();
  else if (!contestView.hidden) renderContest();
  else renderCompetitions();
}

function renderCompetitions() {
  const contestant = isContestant();
  createContestForm.hidden = contestant;
  competitionsLead.textContent = contestant
    ? `These are the contests you can join. Your contestant id is ${contestantId()}.`
    : "Each contest uses one map. Contestants join with their id, and that id is stored on the contest.";
  if (!contestant) fillMapSelect(contestMapSelect, contestMapSelect.value);
  contestFormError.hidden = true;
  contestList.replaceChildren();
  contestEmpty.hidden = contests.length > 0;
  contestList.hidden = contests.length === 0;

  for (const contest of contests) {
    const item = document.createElement("li");
    const openButton = document.createElement("button");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    const map = maps.find((item) => item.id === contest.mapId);
    const people = contest.contestantIds.length > 0 ? contest.contestantIds.join(", ") : "No contestants";

    openButton.type = "button";
    openButton.className = "open-problem";
    openButton.dataset.openContest = contest.id;
    openButton.setAttribute("aria-label", `Open contest ${contest.name}`);
    name.className = "contest-name-label";
    name.textContent = contest.name;
    detail.className = "problem-snippet";
    detail.textContent = `${map ? mapOptionLabel(map) : "Map removed"} · ${people}`;
    openButton.append(name, detail);
    item.append(openButton);

    if (contestant) {
      if (contest.contestantIds.includes(contestantId())) {
        const joined = document.createElement("span");
        joined.className = "joined-flag";
        joined.textContent = "Joined";
        item.append(joined);
      } else {
        const joinButton = document.createElement("button");
        joinButton.type = "button";
        joinButton.className = "join-contest";
        joinButton.dataset.joinId = contest.id;
        joinButton.textContent = "Join";
        item.append(joinButton);
      }
    }

    contestList.append(item);
  }
}

function renderContest() {
  const contest = currentContest();
  if (!contest) { showCompetitions(); return; }

  const contestant = isContestant();
  const map = maps.find((item) => item.id === contest.mapId);
  const joined = contest.contestantIds.includes(contestantId());
  contestTitle.textContent = contest.name;
  contestForm.hidden = contestant;
  contestSummary.hidden = !contestant;
  deleteOpenContestButton.hidden = contestant;
  joinContestButton.hidden = !contestant || joined;
  joinedNote.hidden = !contestant || !joined;
  joinedNote.textContent = `Joined as ${contestantId()}.`;

  if (contestant) {
    contestSummary.textContent = map
      ? `This contest uses ${map.name} (${map.cols} × ${map.rows}).`
      : "The map for this contest has been removed.";
  } else {
    contestNameField.value = contest.name;
    fillMapSelect(contestMapField, contest.mapId);
    deleteOpenContestButton.setAttribute("aria-label", `Delete contest ${contest.name}`);
  }

  contestantList.replaceChildren();
  contestantEmpty.hidden = contest.contestantIds.length > 0;
  contestantList.hidden = contest.contestantIds.length === 0;
  for (const contestantId of contest.contestantIds) {
    const item = document.createElement("li");
    const id = document.createElement("span");
    id.className = "contest-name-label";
    id.textContent = contestantId;
    item.append(id);
    if (!contestant) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-contestant";
      removeButton.dataset.removeContestant = contestantId;
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${contestantId}`);
      item.append(removeButton);
    }
    contestantList.append(item);
  }
}

let selectedStudentCell = null;

function showStudent() {
  if (!requireSession()) return;
  if (!isContestant()) {
    showCompetitions();
    return;
  }
  stopPaint();
  openMapId = null;
  openContestId = null;
  selectedStudentCell = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  studentView.hidden = false;
  setCurrentSection(competitionsButton);
  renderStudent();
}

function showStudentPlay(contestId) {
  if (!requireSession() || !isContestant()) return;
  stopPaint();
  openMapId = null;
  openContestId = contestId;
  selectedStudentCell = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  studentPlayView.hidden = false;
  setCurrentSection(competitionsButton);
  renderStudentPlay();
}

function renderStudent() {
  studentError.hidden = loadError.hidden;
  studentError.textContent = loadError.textContent;
  studentContestList.replaceChildren();
  studentEmpty.hidden = contests.length > 0;
  studentContestList.hidden = contests.length === 0;

  for (const contest of contests) {
    const item = document.createElement("li");
    const openButton = document.createElement("button");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    const map = maps.find((item) => item.id === contest.mapId);
    const joined = contest.contestantIds.includes(contestantId());

    openButton.type = "button";
    openButton.className = "open-problem";
    openButton.dataset.studentOpen = contest.id;
    openButton.setAttribute("aria-label", `Open contest ${contest.name}`);
    name.className = "contest-name-label";
    name.textContent = contest.name;
    detail.className = "problem-snippet";
    detail.textContent = map ? mapOptionLabel(map) : "Map removed";
    openButton.append(name, detail);
    item.append(openButton);

    if (joined) {
      const flag = document.createElement("span");
      flag.className = "joined-flag";
      flag.textContent = "Joined";
      item.append(flag);
    } else {
      const joinButton = document.createElement("button");
      joinButton.type = "button";
      joinButton.className = "join-contest";
      joinButton.dataset.joinId = contest.id;
      joinButton.textContent = "Join";
      item.append(joinButton);
    }
    studentContestList.append(item);
  }
}

function onStudentListClick(event) {
  const openButton = event.target.closest("[data-student-open]");
  if (openButton) {
    showStudentPlay(openButton.dataset.studentOpen);
    return;
  }
  const joinButton = event.target.closest("[data-join-id]");
  if (joinButton) joinContest(joinButton.dataset.joinId);
}

function renderStudentPlay() {
  const contest = currentContest();
  if (!contest) {
    showStudent();
    return;
  }

  const map = maps.find((item) => item.id === contest.mapId);
  const joined = contest.contestantIds.includes(contestantId());
  studentPlayTitle.textContent = contest.name;
  studentJoin.hidden = joined;
  studentJoined.hidden = !joined;
  studentJoined.textContent = `Joined as ${contestantId()}.`;
  studentBoard.hidden = !joined;
  studentProblem.hidden = true;

  if (!map) {
    studentPlayMeta.textContent = "The map for this contest has been removed.";
    studentBoard.hidden = true;
    return;
  }

  studentPlayMeta.textContent = joined
    ? `${map.name} · ${map.cols} × ${map.rows}. Click a problem to read it.`
    : `${map.name} · ${map.cols} × ${map.rows}. Join to open the map.`;

  if (!joined) return;

  studentGrid.style.gridTemplateColumns = `repeat(${map.cols}, ${CELL_SIZE}px)`;
  studentGrid.style.gridTemplateRows = `repeat(${map.rows}, ${CELL_SIZE}px)`;
  studentGrid.replaceChildren();

  map.cells.forEach((cell, index) => {
    const button = document.createElement("button");
    const row = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;
    button.type = "button";
    button.className = `grid-cell student-cell ${cell.kind}`;
    button.dataset.index = String(index);
    button.setAttribute("aria-label", cellLabel(cell, row, column));
    if (cell.kind === "problem") {
      button.textContent = problemTag(cell.problemNo, cell.type);
      button.setAttribute("aria-pressed", selectedStudentCell === index ? "true" : "false");
    } else {
      button.disabled = true;
    }
    studentGrid.append(button);
  });

  showStudentProblem(map);
}

function showStudentProblem(map) {
  const cell = selectedStudentCell === null ? null : map.cells[selectedStudentCell];
  if (!cell || cell.kind !== "problem") {
    studentProblem.hidden = true;
    return;
  }
  const problem = findProblem(cell.problemNo, cell.type);
  studentProblem.hidden = false;
  studentProblemTag.textContent = problemTag(cell.problemNo, cell.type);
  studentProblemPrompt.textContent = problem && problem.prompt.trim()
    ? problem.prompt
    : "This problem has no text yet.";
}

function onStudentGridClick(event) {
  const button = event.target.closest("[data-index]");
  if (!button || button.disabled) return;
  const contest = currentContest();
  const map = contest && maps.find((item) => item.id === contest.mapId);
  if (!map || !contest.contestantIds.includes(contestantId())) return;
  const index = Number(button.dataset.index);
  const cell = map.cells[index];
  if (!cell || cell.kind !== "problem") return;
  selectedStudentCell = index;
  renderStudentPlay();
}

function fillMapSelect(select, selectedId) {
  const previous = selectedId || select.value;
  select.replaceChildren();
  if (maps.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No maps yet";
    select.append(option);
    return;
  }
  for (const map of maps) {
    const option = document.createElement("option");
    option.value = map.id;
    option.textContent = mapOptionLabel(map);
    select.append(option);
  }
  if (previous && maps.some((map) => map.id === previous)) {
    select.value = previous;
    return;
  }
  if (previous) {
    const missing = document.createElement("option");
    missing.value = "";
    missing.textContent = "Map removed";
    select.prepend(missing);
    select.value = "";
  }
}

function mapOptionLabel(map) {
  const base = `${map.name} · ${map.cols} × ${map.rows}`;
  const same = maps.filter((item) => `${item.name} · ${item.cols} × ${item.rows}` === base);
  if (same.length === 1) return base;
  return `${base} (${same.findIndex((item) => item.id === map.id) + 1})`;
}

function readMapName(value) {
  const name = value.trim();
  if (!name || name.length > 60) return null;
  return name;
}

function currentContest() {
  return contests.find((contest) => contest.id === openContestId) || null;
}

function readContestName(value) {
  const name = value.trim();
  if (!name || name.length > 60) return null;
  return name;
}

// ═══════════════════════════════════════════════════════════════════
// Session storage
// ═══════════════════════════════════════════════════════════════════

function readStoredSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!stored || typeof stored.token !== "string" || !stored.user) return null;
    if (tokenExpired(stored.token)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const username = String(stored.user.username || "").trim();
    if (!username) return null;
    return {
      token: stored.token,
      user: {
        username,
        displayName: String(stored.user.displayName || username),
        role: stored.user.role === "admin" ? "admin" : "student",
        pfp: safePfp(stored.user.pfp),
      },
    };
  } catch {
    return null;
  }
}

function persistSession() {
  try {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Stay signed in for this visit if storage is unavailable.
  }
}

function tokenExpired(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);
    return typeof data.exp !== "number" || data.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function safePfp(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url || url.length > 500) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
  } catch {
    return "";
  }
  return "";
}

// ═══════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════

async function bootstrap() {
  if (!isSignedIn()) {
    location.replace("login.html");
    return;
  }

  try {
    const data = await apiCall("bootstrap");
    maps = Array.isArray(data.maps) ? data.maps : [];
    problems = Array.isArray(data.problems) ? data.problems : [];
    contests = Array.isArray(data.contests) ? data.contests : [];
    bootstrapped = true;
    loadError.hidden = true;

    if (data.user) {
      session.user = { ...session.user, ...data.user };
      if (!isAdmin()) session.user.role = "student";
      persistSession();
    }

    applyAccount();
    updateHomeLead();
    if (isContestant()) showStudent();
  } catch (e) {
    console.error("[bootstrap]", e);
    if (String(e.message).includes("Unauthorized")) {
      logOut();
      return;
    }
    bootstrapped = false;
    loadError.hidden = false;
    loadError.textContent = "The game data could not be loaded, so changes will not be saved. Refresh the page to try again.";
    applyAccount();
    updateHomeLead();
    if (isContestant()) showStudent();
  }
}

bootstrap();