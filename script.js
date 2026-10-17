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
const MAX_CONTEST_MINUTES = 10080;
const PROBLEM_TYPES = [
  { id: "math", name: "Math", tag: "MO" },
  { id: "oi", name: "OI", tag: "OI" },
  { id: "science", name: "Science", tag: "SCI" },
  { id: "puzzle", name: "Puzzle", tag: "PUZ" },
];
const DIFFICULTIES = ["easy", "normal", "hard", "insane"];
const DIFFICULTY_SCORE = { easy: 1, normal: 2, hard: 3, insane: 4 };
const DIFFICULTY_NAME = { easy: "Easy", normal: "Normal", hard: "Hard", insane: "Insane" };
const TEAM_COLORS = ["#3ee0ff", "#ff9a1a", "#4d7cff", "#ff4d8d", "#f2f5f8", "#d4a574"];

const API_BASE = "/api/territory";

const homeButton = document.querySelector("#home-button");
const menuButton = document.querySelector("#menu-button");
const sidebarBackdrop = document.querySelector(".sidebar-backdrop");
const mapsButton = document.querySelector("#maps-button");
const problemsButton = document.querySelector("#problems-button");
const competitionsButton = document.querySelector("#competitions-button");
const creditsLabel = document.querySelector("#credits-label");
const tutorialButton = document.querySelector("#tutorial-button");
const tutorialView = document.querySelector("#tutorial-view");
const settingsButton = document.querySelector("#settings-button");
const settingsView = document.querySelector("#settings-view");
const accountForm = document.querySelector("#account-form");
const accountUsername = document.querySelector("#account-username");
const accountDisplayName = document.querySelector("#account-display-name");
const accountPassword = document.querySelector("#account-password");
const accountFormError = document.querySelector("#account-form-error");
const accountListError = document.querySelector("#account-list-error");
const accountEmpty = document.querySelector("#account-empty");
const accountList = document.querySelector("#account-list");
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
const mapCellSize = new WeakMap();
const pinchBound = new WeakSet();

function mapUsesPinch() {
  return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 1100px)").matches;
}

function cellSizeLimits(scroll, cols, rows) {
  const width = Math.max(scroll?.clientWidth || 0, 240);
  const height = Math.max(scroll?.clientHeight || 0, 240);
  const fit = Math.min(
    (width - 2 * Math.max(cols - 1, 0)) / Math.max(cols, 1),
    (height - 2 * Math.max(rows - 1, 0)) / Math.max(rows, 1)
  );
  const close = Math.min(width, height) / 6;
  const min = Math.max(12, Math.min(fit, close));
  return { min, max: Math.max(min, close) };
}

function layoutMapGrid(grid, cols, rows) {
  const scroll = grid.closest(".grid-scroll");
  let size = CELL_SIZE;
  if (scroll && mapUsesPinch()) {
    const limits = cellSizeLimits(scroll, cols, rows);
    const saved = mapCellSize.get(grid);
    size = Math.min(limits.max, Math.max(limits.min, saved || limits.min));
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
  const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
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
    layoutMapGrid(grid, cols, rows);
    const limits = cellSizeLimits(scroll, cols, rows);
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

const backButton = document.querySelector("#back-button");
const deleteOpenMapButton = document.querySelector("#delete-open-map");
const editorTitle = document.querySelector("#editor-title");
const editorSize = document.querySelector("#editor-size");
const editorNameInput = document.querySelector("#map-name-input");
const editorGrid = document.querySelector("#editor-grid");
const saveMapButton = document.querySelector("#save-map-button");
const saveProblemButton = document.querySelector("#save-problem-button");
const problemSaveError = document.querySelector("#problem-save-error");
const kindProblem = document.querySelector("#kind-problem");
const mobileHome = document.querySelector("#mobile-home");
const kindSpawnpoint = document.querySelector("#kind-spawnpoint");
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
const problemPages = document.querySelector("#problem-pages");
const problemSelectToggle = document.querySelector("#problem-select-toggle");
const problemBulk = document.querySelector("#problem-bulk");
const problemSelectPage = document.querySelector("#problem-select-page");
const problemSelectAll = document.querySelector("#problem-select-all");
const problemSelectedCount = document.querySelector("#problem-selected-count");
const problemBulkDifficulty = document.querySelector("#problem-bulk-difficulty");
const problemBulkDelete = document.querySelector("#problem-bulk-delete");
const problemList = document.querySelector("#problem-list");
const problemBackButton = document.querySelector("#problem-back-button");
const deleteOpenProblemButton = document.querySelector("#delete-open-problem");
const problemEditorTitle = document.querySelector("#problem-editor-title");
const problemEditorForm = document.querySelector("#problem-editor-form");
const problemIndexField = document.querySelector("#problem-index-field");
const problemIndexInput = document.querySelector("#problem-index-input");
const problemIndexNote = document.querySelector("#problem-index-note");
const problemIndexError = document.querySelector("#problem-index-error");
const problemTypeChoices = document.querySelector("#problem-type-choices");
const problemDifficultyChoices = document.querySelector("#problem-difficulty-choices");
const problemPrompt = document.querySelector("#problem-prompt");
const problemAnswer = document.querySelector("#problem-answer");
const problemLogic = document.querySelector("#problem-logic");
const createContestForm = document.querySelector("#create-contest-form");
const contestNameInput = document.querySelector("#contest-name");
const contestMapSelect = document.querySelector("#contest-map");
const contestMapNote = document.querySelector("#contest-map-note");
const contestStartInput = document.querySelector("#contest-start");
const contestDurationInput = document.querySelector("#contest-duration");
const contestSpawnInput = document.querySelector("#contest-spawn");
const contestReadyInput = document.querySelector("#contest-ready");
const contestFormError = document.querySelector("#contest-form-error");
const contestEmpty = document.querySelector("#contest-empty");
const contestList = document.querySelector("#contest-list");
const contestBackButton = document.querySelector("#contest-back-button");
const deleteOpenContestButton = document.querySelector("#delete-open-contest");
const contestTitle = document.querySelector("#contest-title");
const contestForm = document.querySelector("#contest-form");
const contestNameField = document.querySelector("#contest-name-input");
const contestMapField = document.querySelector("#contest-map-input");
const contestMapEditNote = document.querySelector("#contest-map-edit-note");
const contestStartField = document.querySelector("#contest-start-input");
const contestDurationField = document.querySelector("#contest-duration-input");
const contestSpawnField = document.querySelector("#contest-spawn-input");
const contestReadyField = document.querySelector("#contest-ready-input");
const contestScheduleError = document.querySelector("#contest-schedule-error");
const teamForm = document.querySelector("#team-form");
const teamNameInput = document.querySelector("#team-name");
const teamMemberA = document.querySelector("#team-member-a");
const teamMemberB = document.querySelector("#team-member-b");
const teamFormError = document.querySelector("#team-form-error");
const contestantEmpty = document.querySelector("#contestant-empty");
const contestantList = document.querySelector("#contestant-list");
const contestLeaderboard = document.querySelector("#contest-leaderboard");
const contestLeaderboardEmpty = document.querySelector("#contest-leaderboard-empty");
const contestGrid = document.querySelector("#contest-grid");
const studentView = document.querySelector("#student-view");
const studentError = document.querySelector("#student-error");
const studentEmpty = document.querySelector("#student-empty");
const studentContestList = document.querySelector("#student-contest-list");
const studentPlayView = document.querySelector("#student-play-view");
const studentBack = document.querySelector("#student-back");
const studentPlayTitle = document.querySelector("#student-play-title");
const studentPlayMeta = document.querySelector("#student-play-meta");
const studentSpawnNote = document.querySelector("#student-spawn-note");
const studentJoined = document.querySelector("#student-joined");
const studentLeaderboardHeading = document.querySelector("#student-leaderboard-heading");
const studentLeaderboard = document.querySelector("#student-leaderboard");
const studentBoard = document.querySelector("#student-board");
const studentGrid = document.querySelector("#student-grid");
const studentProblem = document.querySelector("#student-problem");
const studentProblemClose = document.querySelector("#student-problem-close");
const studentProblemTag = document.querySelector("#student-problem-tag");
const studentProblemPrompt = document.querySelector("#student-problem-prompt");
const studentAnswerForm = document.querySelector("#student-answer-form");
const studentAnswer = document.querySelector("#student-answer");
const studentAnswerError = document.querySelector("#student-answer-error");

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
let problemRangeStart = 1;
const PROBLEM_PAGE_SIZE = 20;
const selectedProblemKeys = new Set();
let problemSelectMode = false;
let mapSnapshot = null;
let mapDirty = false;
let problemDraft = null;
let problemDirty = false;
let placeType = "math";
let serverOffsetMs = 0;
let contestClock = null;
let shownPhase = "";
let shownListPhases = "";

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
mobileHome.addEventListener("click", showHome);
menuButton.addEventListener("click", () => setMenuOpen(!document.body.classList.contains("menu-open")));
sidebarBackdrop.addEventListener("click", () => setMenuOpen(false));
document.querySelector(".sidebar").addEventListener("click", (event) => {
  if (!event.target.closest("button, input, a, textarea")) setMenuOpen(false);
  else if (event.target.closest("button")) setMenuOpen(false);
});
document.querySelector("main").addEventListener("click", () => {
  if (document.body.classList.contains("menu-open")) setMenuOpen(false);
});
studentProblem.addEventListener("click", (event) => {
  if (!event.target.closest(".student-problem-card")) closeStudentProblem();
});
studentProblemClose.addEventListener("click", closeStudentProblem);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!studentProblem.hidden) {
    closeStudentProblem();
    return;
  }
  setMenuOpen(false);
});
mapsButton.addEventListener("click", showMaps);
problemsButton.addEventListener("click", showProblems);
competitionsButton.addEventListener("click", showCompetitions);
tutorialButton.addEventListener("click", showTutorial);
settingsButton.addEventListener("click", showSettings);
accountForm.addEventListener("submit", createAccount);
accountList.addEventListener("click", onAccountListClick);
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
contestMapSelect.addEventListener("change", () => updateContestSpawnNote(contestMapSelect, contestMapNote));
contestStartField.addEventListener("input", commitContestSchedule);
contestDurationField.addEventListener("input", commitContestSchedule);
contestSpawnField.addEventListener("input", commitContestSchedule);
contestReadyField.addEventListener("input", commitContestSchedule);
contestStartField.addEventListener("change", finishContestScheduleEdit);
contestDurationField.addEventListener("change", finishContestScheduleEdit);
contestSpawnField.addEventListener("change", finishContestScheduleEdit);
contestReadyField.addEventListener("change", finishContestScheduleEdit);
teamForm.addEventListener("submit", addTeam);
contestantList.addEventListener("click", onContestantListClick);
studentContestList.addEventListener("click", onStudentListClick);
studentBack.addEventListener("click", showStudent);
studentGrid.addEventListener("click", onStudentGridClick);
studentAnswerForm.addEventListener("submit", submitStudentAnswer);
problemSectionChoices.addEventListener("click", onProblemSectionClick);
problemSection.addEventListener("click", onProblemListClick);
problemSection.addEventListener("change", onProblemSelectionChange);
problemSelectToggle.addEventListener("click", toggleProblemSelectMode);
problemSelectPage.addEventListener("change", selectProblemPage);
problemSelectAll.addEventListener("change", selectAllProblems);
problemBulkDifficulty.addEventListener("click", onBulkDifficultyClick);
problemBulkDelete.addEventListener("click", deleteSelectedProblems);
placeTypeChoices.addEventListener("click", onPlaceTypeClick);
problemBackButton.addEventListener("click", closeProblemEditor);
deleteOpenProblemButton.addEventListener("click", deleteOpenProblem);
problemEditorForm.addEventListener("submit", (event) => event.preventDefault());
problemIndexInput.addEventListener("change", () => {
  if (problemReturn === "map") return;
  commitProblemIndex();
});
problemIndexInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    problemIndexInput.blur();
  }
});
problemTypeChoices.addEventListener("click", (event) => {
  const button = event.target.closest("[data-problem-type]");
  if (!button || editingProblemNo === null || problemReturn === "map") return;
  setProblemType(editingProblemNo, button.dataset.problemType);
});
problemDifficultyChoices.addEventListener("click", (event) => {
  const button = event.target.closest("[data-problem-difficulty]");
  if (!button || editingProblemNo === null) return;
  setProblemDifficulty(button.dataset.problemDifficulty);
});
problemPrompt.addEventListener("input", () => {
  updateProblemField("prompt", problemPrompt.value);
  requestAnimationFrame(renderProblemPreview);
});
problemAnswer.addEventListener("input", () => {
  updateProblemField("answer", problemAnswer.value);
  requestAnimationFrame(renderProblemPreview);
});
problemLogic.addEventListener("input", () => {
  updateProblemField("logic", problemLogic.value);
});
backButton.addEventListener("click", showMaps);
saveMapButton.addEventListener("click", saveOpenMap);
saveProblemButton.addEventListener("click", saveOpenProblem);
deleteOpenMapButton.addEventListener("click", deleteOpenMap);
createForm.addEventListener("submit", createMap);
editorNameInput.addEventListener("input", commitMapName);
editorNameInput.addEventListener("change", () => {
  const map = currentMap();
  if (map && !readMapName(editorNameInput.value)) editorNameInput.value = map.name;
});
mapList.addEventListener("click", onMapListClick);
kindProblem.addEventListener("click", () => chooseTool("problem"));
kindSpawnpoint.addEventListener("click", () => chooseTool("spawnpoint"));
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
  if (contests.some((contest) => !contestSchedule(contest))) return;
  _persistContestsDebounced();
}

async function saveContestsNow() {
  if (!bootstrapped || !isAdmin()) return;
  if (contests.some((contest) => !contestSchedule(contest))) {
    throw new Error("Finish the contest schedule before adding a team.");
  }
  await apiCall("save-contests", { contests });
}

function markMapDirty() {
  mapDirty = true;
  if (saveMapButton) saveMapButton.disabled = false;
}

function updateMapSaveButton() {
  if (saveMapButton) saveMapButton.disabled = !mapDirty;
}

function saveOpenMap() {
  if (!mapDirty || !bootstrapped || !isAdmin()) return;
  apiCall("save-maps", { maps }).catch((error) => console.error("[save-maps]", error));
  const map = currentMap();
  mapSnapshot = map ? structuredClone(map) : null;
  mapDirty = false;
  updateMapSaveButton();
}

function discardUnsavedMap() {
  if (!mapDirty || !mapSnapshot) return true;
  if (!window.confirm("Leave without saving map changes?")) return false;
  const index = maps.findIndex((item) => item.id === mapSnapshot.id);
  if (index >= 0) maps[index] = mapSnapshot;
  mapDirty = false;
  mapSnapshot = null;
  updateMapSaveButton();
  return true;
}

function updateProblemSaveButton() {
  if (!saveProblemButton) return;
  saveProblemButton.disabled = !(problemDraft?.isNew || problemDirty);
}

function problemHasUnsavedEdits() {
  if (!problemDraft) return false;
  if (problemDirty) return true;
  if (!problemDraft.isNew) return false;
  return Boolean(problemPrompt.value.trim() || problemAnswer.value.trim() || problemLogic.value.trim());
}

function discardUnsavedProblem() {
  if (problemEditorView.hidden || !problemHasUnsavedEdits()) {
    if (!problemEditorView.hidden) problemDraft = null;
    return true;
  }
  if (!window.confirm("Leave without saving this problem?")) return false;
  problemDraft = null;
  problemDirty = false;
  return true;
}

function saveOpenProblem() {
  if (!problemDraft) return;
  const prompt = problemPrompt.value;
  const answer = problemAnswer.value;
  const logic = problemLogic.value;
  problemDraft.prompt = prompt;
  problemDraft.answer = answer;
  problemDraft.logic = logic;
  if (!prompt.trim() || !answer.trim()) {
    problemSaveError.hidden = false;
    problemSaveError.textContent = "Add both a question and an answer before saving.";
    return;
  }
  problemSaveError.hidden = true;
  let problem = findProblem(problemDraft.index, problemDraft.type);
  if (!problem) {
    problem = {
      index: problemDraft.index,
      type: problemDraft.type,
      prompt,
      answer,
      logic,
      difficulty: problemDraft.difficulty,
    };
    problems.push(problem);
    problems.sort(compareProblems);
  } else {
    problem.prompt = prompt;
    problem.answer = answer;
    problem.logic = logic;
    problem.difficulty = problemDraft.difficulty;
  }
  problemDraft.isNew = false;
  problemDirty = false;
  if (bootstrapped && isAdmin()) {
    apiCall("save-problems", { problems }).catch((error) => console.error("[save-problems]", error));
  }
  updateProblemSaveButton();
}

// ═══════════════════════════════════════════════════════════════════
// Views
// ═══════════════════════════════════════════════════════════════════

function showHome() {
  setMenuOpen(false);
  if (!requireSession()) return;
  if (isContestant()) {
    showStudent();
    return;
  }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
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
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
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

let accounts = [];

function showTutorial() {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  tutorialView.hidden = false;
  setCurrentSection(tutorialButton);
}

function showSettings() {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  settingsView.hidden = false;
  setCurrentSection(settingsButton);
  loadAccounts();
}

async function loadAccounts() {
  accountFormError.hidden = true;
  accountListError.hidden = true;
  try {
    const data = await apiCall("list-accounts");
    accounts = Array.isArray(data.accounts) ? data.accounts : [];
    renderAccounts();
  } catch (error) {
    accountListError.hidden = false;
    accountListError.textContent = error.message;
  }
}

async function createAccount(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const username = accountUsername.value.trim();
  const password = accountPassword.value;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
    accountFormError.hidden = false;
    accountFormError.textContent = "Username can use letters, numbers, dots, dashes, and underscores.";
    return;
  }
  if (password.length < 4) {
    accountFormError.hidden = false;
    accountFormError.textContent = "Password must be at least 4 characters.";
    return;
  }
  accountFormError.hidden = true;
  try {
    await apiCall("create-account", {
      username,
      displayName: accountDisplayName.value.trim(),
      password,
    });
    accountUsername.value = "";
    accountDisplayName.value = "";
    accountPassword.value = "";
    await loadAccounts();
  } catch (error) {
    accountFormError.hidden = false;
    accountFormError.textContent = error.message;
  }
}

function renderAccounts() {
  accountList.replaceChildren();
  accountEmpty.hidden = accounts.length > 0;
  accountList.hidden = accounts.length === 0;
  for (const account of accounts) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    name.className = "contest-name-label";
    name.textContent = account.username;
    detail.className = "problem-snippet";
    detail.textContent = account.role === "admin"
      ? "Admin"
      : account.banned ? "Student · suspended" : "Student";
    item.append(name, detail);
    if (account.role !== "admin") {
      const display = document.createElement("input");
      display.className = "contest-name";
      display.value = account.displayName;
      display.maxLength = 60;
      display.setAttribute("aria-label", `Display name for ${account.username}`);
      display.addEventListener("change", () => updateAccount(account.username, { displayName: display.value }));

      const password = document.createElement("input");
      password.type = "password";
      password.className = "contest-name";
      password.placeholder = "New password";
      password.maxLength = 256;
      password.autocomplete = "new-password";
      password.setAttribute("aria-label", `New password for ${account.username}`);

      const setPassword = document.createElement("button");
      setPassword.type = "button";
      setPassword.className = "remove-contestant";
      setPassword.dataset.accountPassword = account.username;
      setPassword.textContent = "Set password";

      const suspend = document.createElement("button");
      suspend.type = "button";
      suspend.className = "remove-contestant";
      suspend.dataset.accountSuspend = account.username;
      suspend.dataset.banned = String(account.banned);
      suspend.textContent = account.banned ? "Restore" : "Suspend";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-contestant";
      remove.dataset.accountDelete = account.username;
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete ${account.username}`);
      item.append(display, password, setPassword, suspend, remove);
    }
    accountList.append(item);
  }
}

async function onAccountListClick(event) {
  const passwordButton = event.target.closest("[data-account-password]");
  if (passwordButton) {
    const field = passwordButton.parentElement.querySelector("input[type='password']");
    await updateAccount(passwordButton.dataset.accountPassword, { password: field.value });
    return;
  }
  const suspendButton = event.target.closest("[data-account-suspend]");
  if (suspendButton) {
    await updateAccount(suspendButton.dataset.accountSuspend, { banned: suspendButton.dataset.banned !== "true" });
    return;
  }
  const deleteButton = event.target.closest("[data-account-delete]");
  if (!deleteButton) return;
  const username = deleteButton.dataset.accountDelete;
  if (!confirmTwice(
    `Delete the student account ${username}?`,
    `Delete ${username} now? This student will no longer be able to sign in.`
  )) return;
  accountListError.hidden = true;
  try {
    await apiCall("delete-account", { username });
    await loadAccounts();
  } catch (error) {
    accountListError.hidden = false;
    accountListError.textContent = error.message;
  }
}

async function updateAccount(username, change) {
  if (typeof change.password === "string" && change.password.length < 4) {
    accountListError.hidden = false;
    accountListError.textContent = "Password must be at least 4 characters.";
    return;
  }
  accountListError.hidden = true;
  try {
    await apiCall("update-account", { username, ...change });
    await loadAccounts();
  } catch (error) {
    accountListError.hidden = false;
    accountListError.textContent = error.message;
  }
}

function showProblems() {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
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
  if (mapSnapshot && mapSnapshot.id !== mapId && !discardUnsavedMap()) return;
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
  const map = currentMap();
  if (map && (!mapSnapshot || mapSnapshot.id !== map.id)) {
    mapSnapshot = structuredClone(map);
    mapDirty = false;
  }
  updateMapSaveButton();
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
  settingsView.hidden = true;
  tutorialView.hidden = true;
}

function setMenuOpen(open) {
  const wasOpen = document.body.classList.contains("menu-open");
  document.body.classList.toggle("menu-open", open);
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  sidebarBackdrop.hidden = !open;
  if (wasOpen && !open) menuButton.focus();
}

function setCurrentSection(button) {
  mapsButton.removeAttribute("aria-current");
  problemsButton.removeAttribute("aria-current");
  competitionsButton.removeAttribute("aria-current");
  tutorialButton.removeAttribute("aria-current");
  settingsButton.removeAttribute("aria-current");
  if (button) button.setAttribute("aria-current", "page");
}

// ═══════════════════════════════════════════════════════════════════
// Map CRUD
// ═══════════════════════════════════════════════════════════════════

function confirmTwice(first, second) {
  return window.confirm(first) && window.confirm(second);
}

function deleteOpenMap() {
  const map = currentMap();
  if (!map) return;
  const name = map.name || "this map";
  if (!confirmTwice(`Delete the map ${name}?`, `Delete ${name} now? The map and every cell on it will be removed.`)) return;
  maps = maps.filter((item) => item.id !== openMapId);
  mapDirty = false;
  mapSnapshot = null;
  updateMapSaveButton();
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
  markMapDirty();
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
  kindSpawnpoint.setAttribute("aria-pressed", String(kind === "spawnpoint"));
  kindObstacle.setAttribute("aria-pressed", String(kind === "obstacle"));
  kindEmpty.setAttribute("aria-pressed", String(kind === "empty"));
  problemOptions.hidden = kind !== "problem";
}

function fingerMap() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function startPaint(event) {
  const index = cellIndexFromTarget(event.target);
  if (index === null) return;
  if (fingerMap() && event.pointerType === "touch") {
    armTouchPaint(event, index);
    return;
  }

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

let touchPaint = null;

function armTouchPaint(event, index) {
  touchPaint = { x: event.clientX, y: event.clientY, index, pointerId: event.pointerId, moved: false };
  window.addEventListener("pointermove", moveTouchPaint);
  window.addEventListener("pointerup", finishTouchPaint);
  window.addEventListener("pointercancel", cancelTouchPaint);
}

function moveTouchPaint(event) {
  if (!touchPaint || event.pointerId !== touchPaint.pointerId) return;
  if (Math.hypot(event.clientX - touchPaint.x, event.clientY - touchPaint.y) > 10) touchPaint.moved = true;
}

function finishTouchPaint(event) {
  if (!touchPaint || (event && event.pointerId !== touchPaint.pointerId)) return;
  const tap = touchPaint;
  cancelTouchPaint();
  if (!tap.moved) applyTool(tap.index, "toggle");
}

function cancelTouchPaint() {
  touchPaint = null;
  window.removeEventListener("pointermove", moveTouchPaint);
  window.removeEventListener("pointerup", finishTouchPaint);
  window.removeEventListener("pointercancel", cancelTouchPaint);
}

function stopPaint() {
  cancelTouchPaint();
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
    markMapDirty();
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
    paintCell(map, index);
    markMapDirty();
    if (nextNumberInput.checked && problemNo < MAX_PROBLEM_NO) {
      problemNoInput.value = String(problemNo + 1);
    }
    return;
  }

  paintedThisStroke.add(index);
  strokeCount += 1;
  if (paintKind === "spawnpoint") map.cells[index] = { kind: "spawnpoint" };
  else if (paintKind === "obstacle") map.cells[index] = { kind: "obstacle" };
  else map.cells[index] = { kind: "empty" };
  paintCell(map, index);
  markMapDirty();
}

function paintCell(map, index) {
  const button = editorGrid.querySelector(`[data-index="${index}"]`);
  if (!button) return;

  const cell = map.cells[index];
  const row = Math.floor(index / map.cols) + 1;
  const column = (index % map.cols) + 1;
  button.className = cellClassName(cell, "grid-cell");
  button.textContent = cellText(cell);
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
  problemRangeStart = 1;
  problemSelectMode = false;
  selectedProblemKeys.clear();
  renderProblems();
}

function toggleProblemSelectMode() {
  problemSelectMode = !problemSelectMode;
  if (!problemSelectMode) selectedProblemKeys.clear();
  renderProblems();
}

function addProblem(type) {
  const problemType = typeInfo(type) ? type : "math";
  showProblemEditor(nextProblemNo(problemType), problemType, false);
}

function deleteOpenProblem() {
  if (problemDraft?.isNew && !findProblem(problemDraft.index, problemDraft.type)) {
    problemDraft = null;
    problemDirty = false;
    showProblems();
    return;
  }
  deleteProblem(editingProblemNo, editingProblemType);
}

function onProblemListClick(event) {
  if (event.target.closest("#add-problem")) {
    if (activeProblemType) addProblem(activeProblemType);
    return;
  }

  const rangeButton = event.target.closest("[data-problem-range]");
  if (rangeButton) {
    problemRangeStart = Number(rangeButton.dataset.problemRange);
    renderProblems();
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
  const existing = findProblem(index, problemType);
  problemDraft = existing
    ? {
      index: existing.index,
      type: existing.type,
      prompt: existing.prompt,
      answer: existing.answer,
      logic: existing.logic || "",
      difficulty: problemDifficulty(existing),
      isNew: false,
    }
    : { index, type: problemType, prompt: "", answer: "", logic: "", difficulty: "normal", isNew: true };
  problemDirty = false;
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
  updateProblemSaveButton();
  problemPrompt.focus();
}

function closeProblemEditor() {
  if (!discardUnsavedProblem()) return;
  const mapId = openMapId;
  if (problemReturn === "map" && mapId && maps.some((map) => map.id === mapId)) {
    showEditor(mapId, { keepTool: true });
    return;
  }
  const problem = findProblem(editingProblemNo, editingProblemType);
  if (problem) {
    activeProblemType = problem.type;
    problemRangeStart = problemRangeStartFor(problem.index);
  }
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
  if (problemDraft?.isNew) {
    if (findProblem(next, problemDraft.type)) {
      problemIndexError.hidden = false;
      problemIndexError.textContent = "That index already belongs to another problem.";
      problemIndexInput.value = String(problemDraft.index);
      return;
    }
    problemDraft.index = next;
    editingProblemNo = next;
    problemDirty = true;
    updateProblemSaveButton();
    renderProblemEditor();
    return;
  }
  if (!reindexProblem(editingProblemNo, next)) {
    problemIndexInput.value = String(editingProblemNo);
    return;
  }

  editingProblemNo = next;
  if (problemDraft) problemDraft.index = next;
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
    const swap = window.confirm(
      `${otherTag} already belongs to another ${typeName} problem. Swap these indexes? ${movingTag} becomes ${movingNext}, and ${otherTag} becomes ${otherNext}.`
    );
    if (!swap) return false;
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
  if (problemDraft?.isNew) {
    if (!typeInfo(type) || problemDraft.type === type) return;
    if (findProblem(problemDraft.index, type)) {
      problemIndexError.hidden = false;
      problemIndexError.textContent = "That index already belongs to another problem of this type.";
      return;
    }
    problemIndexError.hidden = true;
    problemDraft.type = type;
    editingProblemType = type;
    problemDirty = true;
    updateProblemSaveButton();
    renderProblemEditor();
    return;
  }
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
  if (problemDraft) problemDraft.type = type;
  problems.sort(compareProblems);
  persistProblems();
  persistMaps();
  if (problemEditorView.hidden) renderProblems();
  else renderProblemEditor();
}

function setProblemDifficulty(difficulty) {
  if (!problemDraft || !DIFFICULTIES.includes(difficulty) || problemDraft.difficulty === difficulty) return;
  problemDraft.difficulty = difficulty;
  problemDirty = true;
  updateProblemSaveButton();
  renderProblemEditor();
}

function updateProblemField(field, value) {
  if (!problemDraft || (field !== "prompt" && field !== "answer" && field !== "logic")) return;
  problemDraft[field] = value;
  problemDirty = true;
  if (problemSaveError) problemSaveError.hidden = true;
  updateProblemSaveButton();
}

function deleteProblem(index, type) {
  const tag = problemTag(index, type);
  if (!window.confirm(`Delete ${tag}? It will also be cleared from every map.`)) return;
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
  const ranges = [...new Set(items.map((problem) => problemRangeStartFor(problem.index)))].sort((a, b) => a - b);
  if (!ranges.includes(problemRangeStart)) problemRangeStart = ranges[0] || 1;
  const visible = items.filter((problem) => problemRangeStartFor(problem.index) === problemRangeStart);
  problemSection.hidden = false;
  problemSectionTitle.textContent = type.name;
  const tag = document.createElement("span");
  tag.className = "problem-tag";
  tag.textContent = type.tag;
  problemSectionTitle.append(tag);
  addProblemButton.setAttribute("aria-label", `Add ${type.name} problem`);
  problemPages.replaceChildren();
  for (const start of ranges) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.problemRange = String(start);
    button.textContent = problemRangeLabel(start);
    button.setAttribute("aria-pressed", String(start === problemRangeStart));
    problemPages.append(button);
  }
  problemPages.hidden = ranges.length < 2;
  if (items.length === 0) {
    problemSelectMode = false;
    selectedProblemKeys.clear();
  }
  problemSelectToggle.hidden = items.length === 0;
  problemSelectToggle.setAttribute("aria-pressed", String(problemSelectMode));
  problemSelectToggle.textContent = problemSelectMode ? "Done" : "Select";
  problemBulk.hidden = !problemSelectMode || items.length === 0;
  problemList.replaceChildren();
  for (const problem of visible) problemList.append(createProblemEntity(problem));
  problemEmpty.hidden = items.length > 0;
  problemEmpty.textContent = `No ${type.name} problems yet.`;
  problemList.hidden = visible.length === 0;
  pruneProblemSelection();
  syncProblemSelection();
}

function problemKey(type, index) {
  return `${type}:${index}`;
}

function problemsOfActiveType() {
  if (!activeProblemType) return [];
  return problems.filter((problem) => problem.type === activeProblemType);
}

function selectedProblems() {
  return problemsOfActiveType().filter((problem) => selectedProblemKeys.has(problemKey(problem.type, problem.index)));
}

function pruneProblemSelection() {
  const live = new Set(problems.map((problem) => problemKey(problem.type, problem.index)));
  for (const key of selectedProblemKeys) {
    if (!live.has(key)) selectedProblemKeys.delete(key);
  }
}

function syncProblemSelection() {
  const boxes = [...problemList.querySelectorAll("[data-select-problem]")];
  const selectedOnPage = boxes.filter((box) => box.checked).length;
  const chosen = selectedProblems();
  const all = problemsOfActiveType();
  problemSelectPage.checked = boxes.length > 0 && selectedOnPage === boxes.length;
  problemSelectPage.indeterminate = selectedOnPage > 0 && selectedOnPage < boxes.length;
  problemSelectAll.checked = all.length > 0 && chosen.length === all.length;
  problemSelectAll.indeterminate = chosen.length > 0 && chosen.length < all.length;
  problemSelectedCount.textContent = chosen.length === 0 ? "None selected" : `${chosen.length} selected`;
  const idle = chosen.length === 0;
  problemBulkDelete.disabled = idle;
  for (const button of problemBulkDifficulty.querySelectorAll("button")) button.disabled = idle;
}

function onProblemSelectionChange(event) {
  const box = event.target.closest("[data-select-problem]");
  if (!box) return;
  const key = problemKey(box.dataset.selectType, Number(box.dataset.selectProblem));
  if (box.checked) selectedProblemKeys.add(key);
  else selectedProblemKeys.delete(key);
  syncProblemSelection();
}

function selectProblemPage() {
  for (const box of problemList.querySelectorAll("[data-select-problem]")) {
    box.checked = problemSelectPage.checked;
    const key = problemKey(box.dataset.selectType, Number(box.dataset.selectProblem));
    if (box.checked) selectedProblemKeys.add(key);
    else selectedProblemKeys.delete(key);
  }
  syncProblemSelection();
}

function selectAllProblems() {
  for (const problem of problemsOfActiveType()) {
    const key = problemKey(problem.type, problem.index);
    if (problemSelectAll.checked) selectedProblemKeys.add(key);
    else selectedProblemKeys.delete(key);
  }
  for (const box of problemList.querySelectorAll("[data-select-problem]")) {
    box.checked = problemSelectAll.checked;
  }
  syncProblemSelection();
}

function onBulkDifficultyClick(event) {
  const button = event.target.closest("[data-bulk-difficulty]");
  if (!button || button.disabled) return;
  const difficulty = button.dataset.bulkDifficulty;
  const chosen = selectedProblems();
  if (!DIFFICULTIES.includes(difficulty) || chosen.length === 0) return;
  const label = chosen.length === 1
    ? problemTag(chosen[0].index, chosen[0].type)
    : `${chosen.length} ${typeInfo(activeProblemType).name} problems`;
  if (!window.confirm(`Set ${label} to ${DIFFICULTY_NAME[difficulty]}?`)) return;
  for (const problem of chosen) problem.difficulty = difficulty;
  persistProblems();
  renderProblems();
}

function deleteSelectedProblems() {
  const chosen = selectedProblems();
  if (chosen.length === 0) return;
  const label = chosen.length === 1
    ? problemTag(chosen[0].index, chosen[0].type)
    : `${chosen.length} ${typeInfo(activeProblemType).name} problems`;
  const pronoun = chosen.length === 1 ? "It" : "They";
  if (!window.confirm(`Delete ${label}? ${pronoun} will also be cleared from every map.`)) return;
  const keys = new Set(chosen.map((problem) => problemKey(problem.type, problem.index)));
  problems = problems.filter((problem) => !keys.has(problemKey(problem.type, problem.index)));
  for (const map of maps) {
    map.cells.forEach((cell, cellIndex) => {
      if (cell.kind === "problem" && keys.has(problemKey(cell.type, cell.problemNo))) {
        map.cells[cellIndex] = { kind: "empty" };
      }
    });
  }
  for (const key of keys) selectedProblemKeys.delete(key);
  persistProblems();
  persistMaps();
  renderProblems();
}

function problemRangeStartFor(index) {
  const safe = Math.min(MAX_PROBLEM_NO, Math.max(MIN_PROBLEM_NO, index));
  return Math.floor((safe - 1) / PROBLEM_PAGE_SIZE) * PROBLEM_PAGE_SIZE + 1;
}

function problemRangeLabel(start) {
  return `${start}–${Math.min(start + PROBLEM_PAGE_SIZE - 1, MAX_PROBLEM_NO)}`;
}

function createProblemEntity(problem) {
  const item = document.createElement("li");
  const check = document.createElement("label");
  const checkbox = document.createElement("input");
  const openButton = document.createElement("button");
  const index = document.createElement("span");
  const snippet = document.createElement("span");
  const deleteButton = document.createElement("button");
  const tag = problemTag(problem.index, problem.type);

  item.dataset.problemIndex = String(problem.index);
  if (problemSelectMode) {
    check.className = "problem-check";
    checkbox.type = "checkbox";
    checkbox.dataset.selectProblem = String(problem.index);
    checkbox.dataset.selectType = problem.type;
    checkbox.checked = selectedProblemKeys.has(problemKey(problem.type, problem.index));
    checkbox.setAttribute("aria-label", `Select ${tag}`);
    check.append(checkbox);
  }
  openButton.type = "button";
  openButton.className = "open-problem";
  openButton.dataset.openProblem = String(problem.index);
  openButton.dataset.openType = problem.type;
  openButton.setAttribute("aria-label", `Edit ${tag}`);
  index.className = "problem-index";
  index.textContent = `${tag} · ${DIFFICULTY_NAME[problemDifficulty(problem)]}`;
  snippet.className = "problem-snippet";
  snippet.textContent = problemSnippet(problem);
  renderMath(snippet);
  openButton.append(index, snippet);

  deleteButton.type = "button";
  deleteButton.className = "delete-map";
  deleteButton.dataset.deleteProblem = String(problem.index);
  deleteButton.dataset.deleteType = problem.type;
  deleteButton.textContent = "Delete";
  deleteButton.setAttribute("aria-label", `Delete ${tag}`);

  if (problemSelectMode) item.append(check);
  item.append(openButton, deleteButton);
  return item;
}

const MATH_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "$", right: "$", display: false },
  { left: "\\(", right: "\\)", display: false },
];

function renderMath(element) {
  if (!element || typeof renderMathInElement !== "function") return;
  renderMathInElement(element, {
    delimiters: MATH_DELIMITERS,
    throwOnError: false,
    strict: "ignore",
  });
}

function containsHtml(source) {
  return /<\/?[a-z][\w:-]*\b[^>]*>/i.test(source);
}

function liveScript(old) {
  const fresh = document.createElement("script");
  for (const attr of old.attributes) {
    if (attr.name === "src") continue;
    fresh.setAttribute(attr.name, attr.value);
  }
  const src = old.getAttribute("src");
  if (src) fresh.src = src;
  else fresh.textContent = old.textContent;
  return fresh;
}

function setRichText(element, source) {
  element.replaceChildren();
  element.classList.remove("rich-html");
  const text = source || "";
  if (!text.trim()) return;
  if (!containsHtml(text)) {
    element.textContent = text;
    renderMath(element);
    return;
  }
  element.classList.add("rich-html");
  const template = document.createElement("template");
  template.innerHTML = text;
  const scripts = [...template.content.querySelectorAll("script")];
  for (const script of scripts) script.remove();
  element.append(template.content);
  renderMath(element);
  const runScripts = () => {
    if (!element.isConnected) return;
    for (const script of scripts) element.append(liveScript(script));
  };
  if (element.isConnected) runScripts();
  else queueMicrotask(runScripts);
}

function problemSnippet(problem) {
  const raw = (problem.prompt || "").trim();
  if (!raw) return "No text yet";
  // Strip tags for list display
  const div = document.createElement("div");
  div.innerHTML = raw;
  div.querySelectorAll("script, style").forEach((node) => node.remove());
  const text = (div.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return "(empty)";
  return text.length > 36 ? `${text.slice(0, 36).trimEnd()}…` : text;
}

function renderProblemEditor() {
  const problem = problemDraft;
  if (!problem) { showProblems(); return; }

  const tag = problemTag(problem.index, problem.type);
  problemEditorTitle.textContent = tag;
  problemBackButton.textContent = problemReturn === "map" ? "Back to map" : "Back to problems";
  deleteOpenProblemButton.setAttribute("aria-label", `Delete ${tag}`);
  const fromMap = problemReturn === "map";
  problemIndexField.hidden = fromMap;
  problemIndexNote.hidden = fromMap;
  problemTypeChoices.hidden = fromMap;
  problemIndexInput.value = String(problem.index);
  problemIndexError.hidden = true;
  for (const button of problemTypeChoices.querySelectorAll("[data-problem-type]")) {
    button.setAttribute("aria-pressed", String(button.dataset.problemType === problem.type));
  }
  const difficulty = problemDifficulty(problem);
  for (const button of problemDifficultyChoices.querySelectorAll("[data-problem-difficulty]")) {
    button.setAttribute("aria-pressed", String(button.dataset.problemDifficulty === difficulty));
  }
  problemPrompt.value = problem.prompt;
  problemAnswer.value = problem.answer;
  problemLogic.value = problem.logic || "";

  // Render HTML preview
  requestAnimationFrame(renderProblemPreview);
}

// ═══════════════════════════════════════════════════════════════════
// HTML preview for problem fields
// ═══════════════════════════════════════════════════════════════════

function renderProblemPreview() {
  if (!problemEditorForm) return;

  let previewEl = problemEditorForm.querySelector(":scope > .problem-preview");
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.className = "problem-preview";
    problemEditorForm.appendChild(previewEl);
  }
  previewEl.replaceChildren();

  const promptHtml = (problemPrompt.value || "").trim();
  const answerHtml = (problemAnswer.value || "").trim();

  if (!promptHtml && !answerHtml) {
    previewEl.hidden = true;
    return;
  }
  previewEl.hidden = false;

  const box = document.createElement("div");
  box.className = "problem-preview-box";
  previewEl.appendChild(box);

  if (promptHtml) {
    const title = document.createElement("div");
    title.className = "problem-preview-title";
    title.textContent = "Prompt — preview";
    const content = document.createElement("div");
    content.className = "problem-preview-content";
    box.append(title, content);
    setRichText(content, promptHtml);
  }

  if (answerHtml) {
    const title = document.createElement("div");
    title.className = "problem-preview-title";
    title.textContent = "Answer — preview";
    const content = document.createElement("div");
    content.className = "problem-preview-content";
    box.append(title, content);
    setRichText(content, answerHtml);
  }
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
  return { index, type: "math", prompt: "", answer: "", logic: "", difficulty: "normal" };
}

function problemDifficulty(problem) {
  return DIFFICULTIES.includes(problem?.difficulty) ? problem.difficulty : "normal";
}

function cellClassName(cell, ...extra) {
  const parts = [...extra, cell.kind];
  if (cell.kind === "problem") {
    if (!extra.includes("student-cell")) parts.push(typeInfo(cell.type) ? cell.type : "math");
    parts.push(cellDifficulty(cell));
  }
  return parts.join(" ");
}

function cellDifficulty(cell) {
  return problemDifficulty(findProblem(cell.problemNo, cell.type));
}

function cellText(cell) {
  if (cell.kind === "problem") return problemTag(cell.problemNo, cell.type);
  if (cell.kind === "spawnpoint") return "S";
  return "";
}

function cellLabel(cell, row, column) {
  if (cell.kind === "problem") return `Row ${row}, column ${column}, problem ${problemTag(cell.problemNo, cell.type)}`;
  if (cell.kind === "obstacle") return `Row ${row}, column ${column}, obstacle`;
  if (cell.kind === "spawnpoint") return `Row ${row}, column ${column}, spawn point`;
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

function sameContestant(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function teamForUser(contest, username = contestantId()) {
  return (contest?.teams || []).find((team) => (team.members || []).some((member) => sameContestant(member, username))) || null;
}

function teamColor(contest, teamId) {
  const index = (contest.teams || []).findIndex((team) => team.id === teamId);
  return TEAM_COLORS[(index < 0 ? 0 : index) % TEAM_COLORS.length];
}

function teamShort(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(name || "").trim().slice(0, 3).toUpperCase();
}

function cellPlace(map, index) {
  return `row ${Math.floor(index / map.cols) + 1}, column ${(index % map.cols) + 1}`;
}

function normalizeTeams(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((team) => team && typeof team.id === "string" && typeof team.name === "string" && Array.isArray(team.members) && team.members.length === 2)
    .map((team) => ({ id: team.id, name: team.name, members: [String(team.members[0]), String(team.members[1])] }));
}

function normalizeTeamCells(value) {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const item of value) {
    if (!item || typeof item.teamId !== "string" || !Number.isInteger(item.cell) || item.cell < 0) continue;
    const existing = items.findIndex((entry) => entry.teamId === item.teamId);
    if (existing >= 0) items.splice(existing, 1);
    items.push({ teamId: item.teamId, cell: item.cell });
  }
  return items;
}

function normalizeClaims(value) {
  if (!Array.isArray(value)) return [];
  const claims = [];
  const seen = new Set();
  for (const claim of value) {
    if (!claim || typeof claim.teamId !== "string" || !Number.isInteger(claim.cell) || seen.has(claim.cell)) continue;
    seen.add(claim.cell);
    claims.push({
      cell: claim.cell,
      teamId: claim.teamId,
      solvedBy: typeof claim.solvedBy === "string" ? claim.solvedBy : "",
      solvedAt: Number.isFinite(claim.solvedAt) ? claim.solvedAt : 0,
    });
  }
  return claims;
}

function applyContestPlayState(contest, data) {
  const next = data?.contest || {};
  if (Array.isArray(next.teams)) {
    contest.teams = normalizeTeams(next.teams);
    contest.contestantIds = contest.teams.flatMap((team) => team.members);
  }
  if (typeof next.spawnResolved === "boolean") contest.spawnResolved = next.spawnResolved;
  if (Array.isArray(next.spawnChoices)) contest.spawnChoices = normalizeTeamCells(next.spawnChoices);
  if (Array.isArray(next.spawns)) contest.spawns = normalizeTeamCells(next.spawns);
  if (Array.isArray(next.claims)) contest.claims = normalizeClaims(next.claims);
  noteServerTime(data?.serverNow);
}

function contestFrozen(contest, map) {
  if (!contest || !map) return contestPhase(contest) === "ended";
  if (contestPhase(contest) === "ended") return true;
  const problems = map.cells.map((cell, index) => (cell.kind === "problem" ? index : -1)).filter((index) => index >= 0);
  if (problems.length === 0) return false;
  const claimed = new Set((contest.claims || []).map((claim) => claim.cell));
  return problems.every((index) => claimed.has(index));
}

function adjacentToTeam(map, contest, teamId, cell) {
  if (!teamId || !map || !Number.isInteger(cell)) return false;
  const owned = new Set();
  if (contest.spawnResolved) {
    for (const spawn of contest.spawns || []) {
      if (spawn.teamId === teamId) owned.add(spawn.cell);
    }
  }
  for (const claim of contest.claims || []) {
    if (claim.teamId === teamId) owned.add(claim.cell);
  }
  const row = Math.floor(cell / map.cols);
  const column = cell % map.cols;
  const neighbors = [];
  if (column > 0) neighbors.push(cell - 1);
  if (column + 1 < map.cols) neighbors.push(cell + 1);
  if (row > 0) neighbors.push(cell - map.cols);
  if (row + 1 < map.rows) neighbors.push(cell + map.cols);
  return neighbors.some((index) => owned.has(index));
}

function ownerAt(contest, index, cell) {
  const claim = (contest.claims || []).find((item) => item.cell === index);
  if (claim) return (contest.teams || []).find((team) => team.id === claim.teamId) || null;
  if (cell?.kind !== "spawnpoint" || !contest.spawnResolved) return null;
  const spawn = (contest.spawns || []).find((item) => item.cell === index);
  return spawn ? (contest.teams || []).find((team) => team.id === spawn.teamId) || null : null;
}

function buildLeaderboard(contest) {
  const map = maps.find((item) => item.id === contest.mapId);
  return (contest.teams || []).map((team) => {
    let score = 0;
    let solved = 0;
    for (const claim of contest.claims || []) {
      if (claim.teamId !== team.id) continue;
      const cell = map?.cells?.[claim.cell];
      if (!cell || cell.kind !== "problem") continue;
      score += DIFFICULTY_SCORE[cellDifficulty(cell)];
      solved += 1;
    }
    return { teamId: team.id, name: team.name, score, solved };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function renderLeaderboard(list, empty, contest) {
  const rows = buildLeaderboard(contest);
  list.replaceChildren();
  if (empty) {
    empty.hidden = rows.length > 0;
    list.hidden = rows.length === 0;
  }
  for (const row of rows) {
    const item = document.createElement("li");
    item.textContent = `${row.name} — ${row.score} point${row.score === 1 ? "" : "s"} · ${row.solved} solved`;
    item.style.color = teamColor(contest, row.teamId);
    list.append(item);
  }
}

function paintPlayGrid(grid, contest, map, options) {
  grid.dataset.cols = String(map.cols);
  grid.dataset.rows = String(map.rows);
  layoutMapGrid(grid, map.cols, map.rows);
  grid.replaceChildren();
  const choosing = options.student && options.phase === "spawn" && !contest.spawnResolved;
  map.cells.forEach((cell, index) => {
    const button = document.createElement("button");
    const row = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;
    button.type = "button";
    button.dataset.index = String(index);
    const owner = ownerAt(contest, index, cell);
    if (options.student) {
      const reachable = options.phase === "live" && !options.frozen && cell.kind === "problem"
        && !(contest.claims || []).some((claim) => claim.cell === index)
        && adjacentToTeam(map, contest, options.team?.id, index);
      button.className = cellClassName(cell, "grid-cell", "student-cell");
      button.disabled = !((choosing && cell.kind === "spawnpoint") || reachable);
      const solvedByOther = owner && cell.kind === "problem" && owner.id !== options.team?.id;
      if (solvedByOther) {
        button.classList.add("taken");
        button.style.setProperty("--team", teamColor(contest, owner.id));
      } else if (owner && contest.spawnResolved) {
        button.classList.add("owned");
        if (options.team && owner.id === options.team.id) button.classList.add("mine");
        button.style.setProperty("--team", teamColor(contest, owner.id));
        button.classList.add("territory-dot");
        button.textContent = "";
      } else {
        const choice = choosing ? (contest.spawnChoices || []).find((item) => item.teamId === options.team?.id) : null;
        if (choice && choice.cell === index) {
          button.classList.add("mine");
          button.style.setProperty("--team", teamColor(contest, options.team.id));
        }
        button.textContent = cell.kind === "problem" ? "" : cellText(cell);
      }
      if (selectedStudentCell === index && reachable) button.setAttribute("aria-pressed", "true");
    } else {
      button.className = cellClassName(cell, "grid-cell");
      button.disabled = true;
      const label = document.createElement("span");
      label.className = "cell-label";
      label.textContent = cellText(cell);
      button.append(label);
      if (owner) {
        const badge = document.createElement("span");
        badge.className = "cell-owner";
        badge.textContent = teamShort(owner.name);
        badge.style.color = teamColor(contest, owner.id);
        button.append(badge);
      }
    }
    button.setAttribute("aria-label", studentCellLabel(contest, cell, row, column, index));
    grid.append(button);
  });
}

function renderAdminBoard(contest, map) {
  if (!contestGrid) return;
  if (!map) {
    contestGrid.replaceChildren();
    return;
  }
  paintPlayGrid(contestGrid, contest, map, { student: false });
}

let contestSyncAt = 0;
let contestSyncKey = "";
let lastMouseMoveAt = Date.now();
const CONTEST_SYNC_ACTIVE_MS = 1500;
const CONTEST_SYNC_IDLE_MS = 15000;
const CONTEST_SYNC_HIDDEN_MS = 60000;
const MOUSE_IDLE_MS = 5000;

function contestSyncGap() {
  if (document.hidden) return CONTEST_SYNC_HIDDEN_MS;
  if (Date.now() - lastMouseMoveAt >= MOUSE_IDLE_MS) return CONTEST_SYNC_IDLE_MS;
  return CONTEST_SYNC_ACTIVE_MS;
}

function noteMouseMove() {
  const wasIdle = Date.now() - lastMouseMoveAt >= MOUSE_IDLE_MS;
  lastMouseMoveAt = Date.now();
  if (wasIdle) contestSyncAt = 0;
}

document.addEventListener("mousemove", noteMouseMove, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) contestSyncAt = 0;
});

async function syncContest(contest) {
  if (!bootstrapped || !contest) return;
  const now = Date.now();
  if (now - contestSyncAt < contestSyncGap()) return;
  contestSyncAt = now;
  try {
    const data = await apiCall("contest-state", { contestId: contest.id });
    applyContestPlayState(contest, data);
    const key = JSON.stringify({
      teams: contest.teams,
      choices: contest.spawnChoices,
      spawns: contest.spawns,
      resolved: contest.spawnResolved,
      claims: contest.claims,
    });
    if (key === contestSyncKey) return;
    contestSyncKey = key;
    if (studentPlayView && !studentPlayView.hidden) renderStudentPlay();
    else if (contestView && !contestView.hidden) {
      const map = maps.find((item) => item.id === contest.mapId);
      renderContestTeams(contest, map);
      renderLeaderboard(contestLeaderboard, contestLeaderboardEmpty, contest);
      renderAdminBoard(contest, map);
    }
  } catch {
    // The next tick tries again.
  }
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
  tutorialButton.hidden = contestant;
  settingsButton.hidden = contestant;
  accountRole.textContent = user.role === "admin" ? "Admin" : "Student";
  const pfp = safePfp(user.pfp);
  accountPfp.hidden = !pfp;
  accountPfp.src = pfp;
  updateHomeLead();
}

function updateHomeLead() {
  const user = session?.user;
  homeLead.textContent = isContestant()
    ? `Signed in as ${user.displayName || user.username}. Open Contests, choose a spawn point with your teammate, then solve problems next to your territory.`
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
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
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
  const schedule = readSchedule(
    contestStartInput.value,
    contestDurationInput.value,
    contestSpawnInput.value,
    contestReadyInput.value
  );
  if (schedule.error) {
    contestFormError.hidden = false;
    contestFormError.textContent = schedule.error;
    return;
  }
  contestFormError.hidden = true;
  contests.unshift({
    id: crypto.randomUUID(),
    name,
    mapId,
    contestantIds: [],
    teams: [],
    spawnChoices: [],
    spawns: [],
    claims: [],
    spawnResolved: false,
    startAt: schedule.startAt,
    durationMinutes: schedule.durationMinutes,
    spawnMinutes: schedule.spawnMinutes,
    readyMinutes: schedule.readyMinutes,
  });
  persistContests();
  contestNameInput.value = "";
  renderCompetitions();
}

function onContestListClick(event) {
  const openButton = event.target.closest("[data-open-contest]");
  if (openButton) showContest(openButton.dataset.openContest);
}

function deleteOpenContest() {
  if (isContestant()) return;
  const contest = currentContest();
  if (!contest) return;
  const name = contest.name || "this contest";
  if (!confirmTwice(
    `Delete the contest ${name}?`,
    `Delete ${name} now? Teams, scores, and the schedule will be removed.`
  )) return;
  contests = contests.filter((item) => item.id !== openContestId);
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
  if (contest.mapId !== contestMapField.value) {
    contest.spawns = [];
    contest.spawnChoices = [];
    contest.claims = [];
    contest.spawnResolved = false;
  }
  contest.mapId = contestMapField.value;
  updateContestSpawnNote(contestMapField, contestMapEditNote);
  renderContest();
  persistContests();
}

function commitContestSchedule() {
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const schedule = readSchedule(
    contestStartField.value,
    contestDurationField.value,
    contestSpawnField.value,
    contestReadyField.value
  );
  if (schedule.error) {
    contestScheduleError.hidden = false;
    contestScheduleError.textContent = schedule.error;
    return;
  }
  contestScheduleError.hidden = true;
  contest.startAt = schedule.startAt;
  contest.durationMinutes = schedule.durationMinutes;
  contest.spawnMinutes = schedule.spawnMinutes;
  contest.readyMinutes = schedule.readyMinutes;
  persistContests();
}

function finishContestScheduleEdit() {
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const schedule = readSchedule(
    contestStartField.value,
    contestDurationField.value,
    contestSpawnField.value,
    contestReadyField.value
  );
  if (schedule.error) {
    fillContestSchedule(contest);
    contestScheduleError.hidden = Boolean(contestSchedule(contest));
    if (!contestScheduleError.hidden) contestScheduleError.textContent = schedule.error;
    return;
  }
  commitContestSchedule();
  contestStartField.value = formatContestPicker(contest.startAt);
}

async function addTeam(event) {
  event.preventDefault();
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const name = readContestName(teamNameInput.value);
  const memberA = teamMemberA.value.trim();
  const memberB = teamMemberB.value.trim();
  if (!name) {
    teamFormError.hidden = false;
    teamFormError.textContent = "Give the team a name.";
    return;
  }
  if (!memberA || !memberB || memberA.toLowerCase() === memberB.toLowerCase()) {
    teamFormError.hidden = false;
    teamFormError.textContent = "Enter two different student usernames.";
    return;
  }
  teamFormError.hidden = true;
  try {
    await saveContestsNow();
    const data = await apiCall("save-team", { contestId: contest.id, name, memberA, memberB });
    applyContestPlayState(contest, data);
    teamNameInput.value = "";
    teamMemberA.value = "";
    teamMemberB.value = "";
    renderContest();
  } catch (error) {
    teamFormError.hidden = false;
    teamFormError.textContent = error.message;
  }
}

async function onContestantListClick(event) {
  const button = event.target.closest("[data-remove-team]");
  if (!button || isContestant()) return;
  const contest = currentContest();
  if (!contest) return;
  const teamId = button.dataset.removeTeam;
  const team = contest.teams.find((item) => item.id === teamId);
  const teamName = team ? team.name : "this team";
  if (!confirmTwice(
    `Remove the team ${teamName}?`,
    `Remove ${teamName} now? Their spawn point and solved cells will be cleared.`
  )) return;
  const previous = {
    teams: contest.teams.slice(),
    spawnChoices: contest.spawnChoices.slice(),
    spawns: contest.spawns.slice(),
    claims: contest.claims.slice(),
  };
  contest.teams = previous.teams.filter((team) => team.id !== teamId);
  contest.spawnChoices = previous.spawnChoices.filter((choice) => choice.teamId !== teamId);
  contest.spawns = previous.spawns.filter((spawn) => spawn.teamId !== teamId);
  contest.claims = previous.claims.filter((claim) => claim.teamId !== teamId);
  renderContest();
  try {
    const data = await apiCall("remove-team", { contestId: contest.id, teamId });
    applyContestPlayState(contest, data);
  } catch (error) {
    Object.assign(contest, previous);
    alert(error.message);
  }
  renderContest();
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
    ? "Open the contest your team was added to."
    : "Each contest uses one map. Teams of two students choose spawn points, then expand by solving adjacent problems.";
  if (!contestant) {
    fillMapSelect(contestMapSelect, contestMapSelect.value);
    updateContestSpawnNote(contestMapSelect, contestMapNote);
  }
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
    const teamCount = (contest.teams || []).length;
    const people = teamCount === 0 ? "No teams" : `${teamCount} team${teamCount === 1 ? "" : "s"}`;

    openButton.type = "button";
    openButton.className = "open-problem";
    openButton.dataset.openContest = contest.id;
    openButton.setAttribute("aria-label", `Open contest ${contest.name}`);
    name.className = "contest-name-label";
    name.textContent = contest.name;
    detail.className = "problem-snippet";
    detail.textContent = `${map ? mapOptionLabel(map) : "Map removed"} · ${contestTimingLine(contest)} · ${people}`;
    openButton.append(name, detail);
    item.append(openButton);
    contestList.append(item);
  }
}

function renderContest() {
  const contest = currentContest();
  if (!contest) { showCompetitions(); return; }

  const map = maps.find((item) => item.id === contest.mapId);
  contestTitle.textContent = contest.name;
  contestNameField.value = contest.name;
  fillMapSelect(contestMapField, contest.mapId);
  fillContestSchedule(contest);
  updateContestSpawnNote(contestMapField, contestMapEditNote);
  contestScheduleError.hidden = true;
  deleteOpenContestButton.setAttribute("aria-label", `Delete contest ${contest.name}`);
  teamFormError.hidden = true;
  renderContestTeams(contest, map);
  renderLeaderboard(contestLeaderboard, contestLeaderboardEmpty, contest);
  renderAdminBoard(contest, map);
  ensureContestClock();
}

function renderContestTeams(contest, map) {
  const teams = contest.teams || [];
  contestantList.replaceChildren();
  contestantEmpty.hidden = teams.length > 0;
  contestantList.hidden = teams.length === 0;
  for (const team of teams) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    name.className = "contest-name-label";
    name.textContent = team.name;
    detail.className = "problem-snippet";
    detail.textContent = `${team.members.join(" · ")} · ${spawnSummary(contest, map, team.id)}`;
    item.append(name, detail);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-contestant";
    removeButton.dataset.removeTeam = team.id;
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${team.name}`);
    item.append(removeButton);
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
  const mine = contests.filter((contest) => teamForUser(contest));
  studentContestList.replaceChildren();
  studentEmpty.hidden = mine.length > 0;
  studentEmpty.textContent = "You are not on a team yet.";
  studentContestList.hidden = mine.length === 0;

  for (const contest of mine) {
    const item = document.createElement("li");
    const openButton = document.createElement("button");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    const map = maps.find((item) => item.id === contest.mapId);
    const team = teamForUser(contest);

    openButton.type = "button";
    openButton.className = "open-problem";
    openButton.dataset.studentOpen = contest.id;
    openButton.setAttribute("aria-label", `Open contest ${contest.name}`);
    name.className = "contest-name-label";
    name.textContent = contest.name;
    detail.className = "problem-snippet";
    detail.textContent = `${team.name} · ${map ? mapOptionLabel(map) : "Map removed"} · ${phaseLabel(contest)}`;
    openButton.append(name, detail);
    item.append(openButton);
    studentContestList.append(item);
  }
  shownListPhases = mine.map((contest) => contestPhase(contest)).join("|");
  ensureContestClock();
}

function onStudentListClick(event) {
  const openButton = event.target.closest("[data-student-open]");
  if (openButton) showStudentPlay(openButton.dataset.studentOpen);
}

function renderStudentPlay() {
  const contest = currentContest();
  if (!contest || !teamForUser(contest)) {
    showStudent();
    return;
  }

  const map = maps.find((item) => item.id === contest.mapId);
  const team = teamForUser(contest);
  const phase = contestPhase(contest);
  const frozen = contestFrozen(contest, map);
  shownPhase = `${phase}:${frozen}:${contest.spawnResolved}`;
  studentPlayTitle.textContent = contest.name;
  studentJoined.hidden = false;
  studentJoined.textContent = `Team ${team.name}. You are ${contestantId()}.`;
  writeStudentStatus(contest, phase, map, frozen);
  renderLeaderboard(studentLeaderboard, null, contest);
  const showScores = contest.spawnResolved || phase === "live" || phase === "ended" || frozen;
  studentLeaderboard.hidden = !showScores;
  studentLeaderboardHeading.hidden = !showScores;
  studentLeaderboardHeading.textContent = frozen || phase === "ended" ? "Leaderboard" : "Scores";
  studentBoard.hidden = !map;

  if (!map) {
    ensureContestClock();
    return;
  }

  paintPlayGrid(studentGrid, contest, map, { student: true, phase, frozen, team });
  ensureContestClock();
}

function writeStudentStatus(contest, phase, map, frozen) {
  const mapBit = map ? `${map.name} · ${map.cols} × ${map.rows}` : "The map for this contest has been removed.";
  const team = teamForUser(contest);
  const score = buildLeaderboard(contest).find((row) => row.teamId === team?.id);
  const scoreBit = score ? ` ${team.name} has ${score.score} point${score.score === 1 ? "" : "s"}.` : "";
  studentPlayMeta.textContent = `${mapBit}. ${phaseSentence(contest, phase, frozen)}${scoreBit}`;
  if (!map) {
    studentSpawnNote.hidden = true;
    return;
  }
  studentSpawnNote.hidden = false;
  const finalSpawn = contest.spawnResolved
    ? (contest.spawns || []).find((spawn) => spawn.teamId === team?.id)
    : null;
  if (finalSpawn && map.cells[finalSpawn.cell]?.kind === "spawnpoint") {
    studentSpawnNote.textContent = `Your team starts at ${cellPlace(map, finalSpawn.cell)}.`;
    return;
  }
  if (phase === "spawn" && !contest.spawnResolved) {
    const choice = (contest.spawnChoices || []).find((item) => item.teamId === team?.id);
    const count = map.cells.filter((cell) => cell.kind === "spawnpoint").length;
    studentSpawnNote.textContent = choice
      ? `Your team chose ${cellPlace(map, choice.cell)}. Either student can change it until every team has chosen.`
      : count > 0
        ? "Click a spawn point. Either student on your team can choose, and the latest choice is kept."
        : "This map has no spawn points.";
    return;
  }
  if (phase === "before") {
    studentSpawnNote.textContent = "The map is visible. Spawning has not started.";
    return;
  }
  studentSpawnNote.textContent = "Your team does not have a spawn point.";
}

function closeStudentProblem() {
  if (studentProblem.hidden) return;
  selectedStudentCell = null;
  studentProblem.hidden = true;
  studentAnswerForm.hidden = true;
  for (const button of studentGrid.querySelectorAll("[aria-pressed='true']")) {
    button.removeAttribute("aria-pressed");
  }
}

function showStudentProblem(contest, map, phase, frozen) {
  const team = teamForUser(contest);
  const cell = selectedStudentCell === null ? null : map.cells[selectedStudentCell];
  const claim = (contest.claims || []).find((item) => item.cell === selectedStudentCell);
  const playable = phase === "live" && !frozen && cell?.kind === "problem" && !claim
    && adjacentToTeam(map, contest, team?.id, selectedStudentCell);
  if (!playable) {
    studentProblem.hidden = true;
    studentAnswerForm.hidden = true;
    return;
  }
  const problem = findProblem(cell.problemNo, cell.type);
  studentProblem.hidden = false;
  const difficultyName = DIFFICULTY_NAME[cellDifficulty(cell)];
  const points = DIFFICULTY_SCORE[cellDifficulty(cell)];
  studentProblemTag.textContent = `${difficultyName} · ${points} point${points === 1 ? "" : "s"}`;
  studentAnswerForm.hidden = false;
  studentAnswerError.hidden = true;
  studentAnswer.style.cssText = "";
  studentAnswer.readOnly = false;
  if (problem && problem.prompt.trim()) setRichText(studentProblemPrompt, problem.prompt);
  else {
    studentProblemPrompt.classList.remove("rich-html");
    studentProblemPrompt.textContent = "This problem has no text yet.";
  }
  if (!studentAnswer.readOnly) studentAnswer.focus();
}

function onStudentGridClick(event) {
  const button = event.target.closest("[data-index]");
  if (!button || button.disabled) return;
  const contest = currentContest();
  const map = contest && maps.find((item) => item.id === contest.mapId);
  const team = contest && teamForUser(contest);
  if (!map || !team) return;
  const index = Number(button.dataset.index);
  const cell = map.cells[index];
  const phase = contestPhase(contest);
  if (cell?.kind === "spawnpoint" && phase === "spawn" && !contest.spawnResolved) {
    chooseSpawn(contest, index);
    return;
  }
  if (cell?.kind === "problem" && phase === "live" && !contestFrozen(contest, map)) {
    const claim = (contest.claims || []).some((item) => item.cell === index);
    if (claim || !adjacentToTeam(map, contest, team.id, index)) return;
    const url = new URL("answer.html", location.href);
    url.searchParams.set("contest", contest.id);
    url.searchParams.set("cell", String(index));
    window.open(url.href, "_blank", "noopener");
  }
}

async function chooseSpawn(contest, cell) {
  const team = teamForUser(contest);
  if (!team) return;
  const previous = (contest.spawnChoices || []).slice();
  contest.spawnChoices = previous.filter((choice) => choice.teamId !== team.id);
  contest.spawnChoices.push({ teamId: team.id, cell });
  renderStudentPlay();
  try {
    const data = await apiCall("choose-spawn", { contestId: contest.id, cell });
    applyContestPlayState(contest, data);
  } catch (error) {
    contest.spawnChoices = previous;
    alert(error.message);
  }
  renderStudentPlay();
}

async function submitStudentAnswer(event) {
  event.preventDefault();
  const contest = currentContest();
  const map = contest && maps.find((item) => item.id === contest.mapId);
  if (!contest || !map || selectedStudentCell === null) return;
  const submitButton = studentAnswerForm.querySelector("button");
  submitButton.disabled = true;
  let failure = "";
  try {
    const data = await apiCall("solve", {
      contestId: contest.id,
      cell: selectedStudentCell,
      answer: studentAnswer.value,
    });
    applyContestPlayState(contest, data);
    studentAnswer.value = "";
    selectedStudentCell = null;
  } catch (error) {
    failure = error.message;
  }
  submitButton.disabled = false;
  renderStudentPlay();
  if (failure) {
    studentAnswerError.hidden = false;
    studentAnswerError.textContent = failure;
  }
}

function studentCellLabel(contest, cell, row, column, index) {
  const team = ownerAt(contest, index, cell);
  const place = `Row ${row}, column ${column}`;
  if (cell.kind === "problem") {
    const difficultyName = DIFFICULTY_NAME[cellDifficulty(cell)];
    if (team && team.id !== teamForUser(contest)?.id) return `${place}, ${difficultyName}, solved by ${team.name}`;
    if (team) return `${place}, ${difficultyName}, ${team.name}`;
    return `${place}, ${difficultyName}`;
  }
  if (team) return `${place}, ${team.name}`;
  return cellLabel(cell, row, column);
}

function ensureContestClock() {
  if (contestClock) return;
  contestClock = setInterval(tickContestClock, 1000);
}

function tickContestClock() {
  const onList = studentView && !studentView.hidden;
  const onPlay = studentPlayView && !studentPlayView.hidden;
  const onAdmin = contestView && !contestView.hidden && isAdmin();
  if (!onList && !onPlay && !onAdmin) {
    clearInterval(contestClock);
    contestClock = null;
    return;
  }
  if (onPlay || onAdmin) {
    const contest = currentContest();
    if (contest) syncContest(contest);
    if (onPlay) {
      const phase = contestPhase(contest);
      const map = contest && maps.find((item) => item.id === contest.mapId);
      const signature = contest ? `${phase}:${contestFrozen(contest, map)}:${contest.spawnResolved}` : "";
      if (signature !== shownPhase) renderStudentPlay();
      else if (contest) writeStudentStatus(contest, phase, map, contestFrozen(contest, map));
    }
  }
  if (onList) {
    refreshStudentRoster();
    const signature = contests.filter((contest) => teamForUser(contest)).map((contest) => contestPhase(contest)).join("|");
    if (signature !== shownListPhases) renderStudent();
  }
}

let rosterSyncing = false;

function studentRosterKey() {
  return contests
    .filter((contest) => teamForUser(contest))
    .map((contest) => `${contest.id}:${contest.name}:${teamForUser(contest)?.name}:${contestPhase(contest)}`)
    .join("|");
}

async function refreshStudentRoster() {
  if (!bootstrapped || !isContestant() || rosterSyncing) return;
  const now = Date.now();
  if (now - contestSyncAt < contestSyncGap()) return;
  contestSyncAt = now;
  rosterSyncing = true;
  try {
    const before = studentRosterKey();
    const data = await apiCall("bootstrap");
    noteServerTime(data.serverNow);
    if (Array.isArray(data.maps)) maps = data.maps;
    if (Array.isArray(data.contests)) contests = data.contests.map(loadedContest);
    if (studentView && !studentView.hidden && studentRosterKey() !== before) renderStudent();
  } catch (error) {
    console.error("[roster]", error);
  } finally {
    rosterSyncing = false;
  }
}

function serverNow() {
  return Date.now() + serverOffsetMs;
}

function noteServerTime(serverNowMs) {
  if (typeof serverNowMs === "number" && Number.isFinite(serverNowMs)) {
    serverOffsetMs = serverNowMs - Date.now();
  }
}

function contestSchedule(contest) {
  if (!contest || !Number.isInteger(contest.startAt)) return null;
  const duration = contest.durationMinutes;
  const spawn = contest.spawnMinutes;
  const ready = contest.readyMinutes;
  if (![duration, spawn, ready].every((value) => Number.isInteger(value))) return null;
  if (duration < 1 || duration > MAX_CONTEST_MINUTES) return null;
  if (spawn < 0 || ready < 0 || spawn > MAX_CONTEST_MINUTES || ready > MAX_CONTEST_MINUTES) return null;
  if (spawn + ready >= duration) return null;
  const minute = 60 * 1000;
  return {
    startAt: contest.startAt,
    spawnEnd: contest.startAt + spawn * minute,
    liveAt: contest.startAt + (spawn + ready) * minute,
    endAt: contest.startAt + duration * minute,
    duration,
    spawn,
    ready,
  };
}

function contestPhase(contest, now = serverNow()) {
  const schedule = contestSchedule(contest);
  if (!schedule) return "unscheduled";
  if (now < schedule.startAt) return "before";
  if (now < schedule.spawnEnd) return "spawn";
  if (now < schedule.liveAt) return "ready";
  if (now < schedule.endAt) return "live";
  return "ended";
}

function phaseLabel(contest) {
  const phase = contestPhase(contest);
  const schedule = contestSchedule(contest);
  if (!schedule) return "Schedule not set";
  if (phase === "before") return `Starts ${formatContestTime(schedule.startAt)}`;
  if (phase === "spawn") return "Choosing spawn points";
  if (phase === "ready") return "Waiting for the contest";
  if (phase === "live") return "Contest in progress";
  return "Ended";
}

function phaseSentence(contest, phase, frozen = false) {
  const schedule = contestSchedule(contest);
  if (!schedule) return "The schedule is not set yet.";
  if (frozen && phase !== "ended") return "Every problem is solved. The board is frozen.";
  if (phase === "before") {
    if (schedule.spawn === 0) return `The contest begins ${formatContestTime(schedule.liveAt)}.`;
    return `Spawning starts ${formatContestTime(schedule.startAt)} and lasts ${schedule.spawn} min. The contest begins ${formatContestTime(schedule.liveAt)}.`;
  }
  if (phase === "spawn") {
    return contest.spawnResolved
      ? `Spawn points are assigned. The wait begins ${formatContestTime(schedule.spawnEnd)}.`
      : `Choose a spawn point before ${formatContestTime(schedule.spawnEnd)}.`;
  }
  if (phase === "ready") return `Spawning is closed. The contest begins ${formatContestTime(schedule.liveAt)}. Your team's outline is white.`;
  if (phase === "live") return `Solve a problem next to your territory before ${formatContestTime(schedule.endAt)}. Easy is 1, normal 2, hard 3, and insane 4.`;
  return `The contest ended ${formatContestTime(schedule.endAt)}. The board is frozen.`;
}

function contestTimingLine(contest) {
  const schedule = contestSchedule(contest);
  if (!schedule) return "Schedule not set";
  const contestMinutes = schedule.duration - schedule.spawn - schedule.ready;
  return `Starts ${formatContestTime(schedule.startAt)} · spawn ${schedule.spawn} min · wait ${schedule.ready} min · contest ${contestMinutes} min`;
}

function readWholeMinutes(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_CONTEST_MINUTES) return null;
  return minutes;
}

function readSchedule(startValue, durationValue, spawnValue, readyValue) {
  const startAt = parseContestTime(startValue);
  const durationMinutes = readWholeMinutes(durationValue);
  const spawnMinutes = readWholeMinutes(spawnValue);
  const readyMinutes = readWholeMinutes(readyValue);
  if (startAt === null) return { error: "Choose a start date and time." };
  if (durationMinutes === null || spawnMinutes === null || readyMinutes === null) {
    return { error: "Use whole minutes from 0 to 10080. Duration must be at least 1." };
  }
  if (durationMinutes < 1) return { error: "Duration must be at least 1 minute." };
  if (spawnMinutes + readyMinutes >= durationMinutes) {
    return { error: "Spawn time and the wait before the contest must be shorter than the duration." };
  }
  return { startAt, durationMinutes, spawnMinutes, readyMinutes };
}

function parseContestTime(value) {
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
    || date.getSeconds() !== second
  ) return null;
  return date.getTime();
}

function formatContestPicker(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatContestTime(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fillContestSchedule(contest) {
  contestStartField.value = Number.isInteger(contest.startAt) ? formatContestPicker(contest.startAt) : "";
  contestDurationField.value = Number.isInteger(contest.durationMinutes) ? String(contest.durationMinutes) : "";
  contestSpawnField.value = Number.isInteger(contest.spawnMinutes) ? String(contest.spawnMinutes) : "";
  contestReadyField.value = Number.isInteger(contest.readyMinutes) ? String(contest.readyMinutes) : "";
}

function updateContestSpawnNote(select, note) {
  const map = maps.find((item) => item.id === select.value);
  if (!map) {
    note.hidden = true;
    return;
  }
  const count = map.cells.filter((cell) => cell.kind === "spawnpoint").length;
  note.hidden = false;
  note.textContent = count === 0
    ? `${map.name} has no spawn points yet. Place them on the map.`
    : `${map.name} has ${count} spawn point${count === 1 ? "" : "s"}.`;
}

function spawnSummary(contest, map, teamId) {
  const choice = !contest.spawnResolved
    ? (contest.spawnChoices || []).find((item) => item.teamId === teamId)
    : null;
  const spawn = contest.spawnResolved
    ? (contest.spawns || []).find((item) => item.teamId === teamId)
    : null;
  const cell = spawn?.cell ?? choice?.cell;
  if (!Number.isInteger(cell)) return contest.spawnResolved ? "No spawn point" : "Has not chosen";
  if (!map || cell < 0 || cell >= map.cells.length || map.cells[cell].kind !== "spawnpoint") {
    return "Spawn point no longer on the map";
  }
  return `${contest.spawnResolved ? "Starts" : "Chose"} ${cellPlace(map, cell)}`;
}

function loadedContest(raw) {
  const teams = normalizeTeams(raw.teams);
  return {
    id: raw.id,
    name: raw.name,
    mapId: raw.mapId,
    contestantIds: teams.flatMap((team) => team.members),
    teams,
    startAt: Number.isInteger(raw.startAt) ? raw.startAt : null,
    durationMinutes: Number.isInteger(raw.durationMinutes) ? raw.durationMinutes : null,
    spawnMinutes: Number.isInteger(raw.spawnMinutes) ? raw.spawnMinutes : null,
    readyMinutes: Number.isInteger(raw.readyMinutes) ? raw.readyMinutes : null,
    spawnChoices: normalizeTeamCells(raw.spawnChoices),
    spawns: normalizeTeamCells(raw.spawns),
    claims: normalizeClaims(raw.claims),
    spawnResolved: raw.spawnResolved === true,
  };
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
    problems = Array.isArray(data.problems)
      ? data.problems.map((problem) => ({
        ...problem,
        difficulty: problemDifficulty(problem),
        prompt: problem.prompt || "",
        answer: problem.answer || "",
        logic: problem.logic || "",
      }))
      : [];
    contests = Array.isArray(data.contests) ? data.contests.map(loadedContest) : [];
    bootstrapped = true;
    loadError.hidden = true;
    noteServerTime(data.serverNow);

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