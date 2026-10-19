// Generated from scripts/*.js by build-scripts.mjs. Edit the source sections, not this file.

// script.js
// ═══════════════════════════════════════════════════════════════════
// Territory Game — frontend
// All persistence goes through /api/territory
// ═══════════════════════════════════════════════════════════════════

const SESSION_KEY = "territory-game-session";
const MIN_SIZE = 1;
const MAX_SIZE = 40;
const MIN_PROBLEM_NO = 1;
const MAX_PROBLEM_NO = 99999;
const PROBLEM_YEAR = 26;
const YEAR_INDEX_START = PROBLEM_YEAR * 1000;
const YEAR_INDEX_END = PROBLEM_YEAR * 1000 + 999;
const MAX_CONTEST_MINUTES = 10080;
const PROBLEM_TYPES = [
  { id: "math", name: "Math", tag: "M" },
  { id: "oi", name: "OI", tag: "O" },
  { id: "science", name: "Science", tag: "S" },
  { id: "puzzle", name: "Puzzle", tag: "P" },
  { id: "testing", name: "Testing", tag: "T" },
];
const DIFFICULTIES = ["easy", "normal", "hard", "insane"];
const DIFFICULTY_SCORE = { easy: 1, normal: 2, hard: 3, insane: 4 };
const DIFFICULTY_NAME = { easy: "Easy", normal: "Normal", hard: "Hard", insane: "Insane" };
const TEAM_COLOR_LIMIT = 256;

const API_BASE = "/api/territory";

const homeButton = document.querySelector("#home-button");
const menuButton = document.querySelector("#menu-button");
const sidebarBackdrop = document.querySelector(".sidebar-backdrop");
const mapsButton = document.querySelector("#maps-button");
const problemsButton = document.querySelector("#problems-button");
const competitionsButton = document.querySelector("#competitions-button");
const creditsButton = document.querySelector("#credits-button");
const tutorialButton = document.querySelector("#tutorial-button");
const tutorialView = document.querySelector("#tutorial-view");
const creditsView = document.querySelector("#credits-view");
const versionForm = document.querySelector("#version-form");
const versionNameInput = document.querySelector("#version-name");
const versionMessageInput = document.querySelector("#version-message");
const versionFormError = document.querySelector("#version-form-error");
const versionEmpty = document.querySelector("#version-empty");
const versionList = document.querySelector("#version-list");
const settingsButton = document.querySelector("#settings-button");
const settingsView = document.querySelector("#settings-view");
const studentSettingsView = document.querySelector("#student-settings-view");
const answerOpenModeChoices = document.querySelector("#answer-open-mode");
const answerOpenModeNote = document.querySelector("#answer-open-mode-note");
const accountForm = document.querySelector("#account-form");
const accountUsername = document.querySelector("#account-username");
const accountDisplayName = document.querySelector("#account-display-name");
const accountPassword = document.querySelector("#account-password");
const accountFormError = document.querySelector("#account-form-error");
const accountSummary = document.querySelector("#account-summary");
const accountSearch = document.querySelector("#account-search");
const accountFilters = document.querySelector("#account-filters");
const accountStatus = document.querySelector("#account-status");
const accountListError = document.querySelector("#account-list-error");
const accountEmpty = document.querySelector("#account-empty");
const accountList = document.querySelector("#account-list");
const accountName = document.querySelector("#account-name");
const accountRole = document.querySelector("#account-role");
const accountPfp = document.querySelector("#account-pfp");
const accountButton = document.querySelector("#account-button");
const homeView = document.querySelector("#home-view");
const homeLead = homeView?.querySelector(".lead") || null;
const loadError = document.querySelector("#load-error");
const mapsView = document.querySelector("#maps-view");
const problemsView = document.querySelector("#problems-view");
const problemEditorView = document.querySelector("#problem-editor-view");
const problemBatchView = document.querySelector("#problem-batch-view");
const competitionsView = document.querySelector("#competitions-view");
const competitionsLead = document.querySelector("#competitions-lead");
const contestView = document.querySelector("#contest-view");
const editorView = document.querySelector("#editor-view");
const createForm = document.querySelector("#create-map-form");
const mapNameInput = document.querySelector("#map-name");
const createMapMode = document.querySelector("#create-map-mode");
const mapModeChoices = document.querySelector("#map-mode-choices");
const colsInput = document.querySelector("#map-cols");
const rowsInput = document.querySelector("#map-rows");
const formError = document.querySelector("#map-form-error");
const emptyMessage = document.querySelector("#map-empty");
const mapList = document.querySelector("#map-list");
const CELL_SIZE = 64;
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
  scroll?.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2) return;
    startDistance = distance(event.touches);
    startSize = mapCellSize.get(grid) || CELL_SIZE;
  }, { passive: true });
  scroll?.addEventListener("touchmove", (event) => {
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
  scroll?.addEventListener("touchend", (event) => {
    if (event.touches.length < 2) startDistance = 0;
  });
}

const backButton = document.querySelector("#back-button");
const deleteOpenMapButton = document.querySelector("#delete-open-map");
const editorTitle = document.querySelector("#editor-title");
const editorSize = document.querySelector("#editor-size");
const editorCounts = document.querySelector("#map-counts");
const editorNameInput = document.querySelector("#map-name-input");
const editorGrid = document.querySelector("#editor-grid");
const saveMapButton = document.querySelector("#save-map-button");
const saveProblemButton = document.querySelector("#save-problem-button");
const saveProblemTopButton = document.querySelector("#save-problem-top");
const problemSaveState = document.querySelector("#problem-save-state");
const problemSaveError = document.querySelector("#problem-save-error");
const problemUsageNote = document.querySelector("#problem-usage");
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
const placeModeChoices = document.querySelector("#place-mode-choices");
const placeManual = document.querySelector("#place-manual");
const placePick = document.querySelector("#place-pick");
const placePickTypeChoices = document.querySelector("#place-pick-types");
const placePickDifficultyChoices = document.querySelector("#place-pick-difficulties");
const placePickSourceChoices = document.querySelector("#place-pick-source");
const placeFixedField = document.querySelector("#place-fixed-field");
const placeFixedIndex = document.querySelector("#place-fixed-index");
const placeRangeField = document.querySelector("#place-range-field");
const placeRangeFrom = document.querySelector("#place-range-from");
const placeRangeTo = document.querySelector("#place-range-to");
const problemSectionChoices = document.querySelector("#problem-section-choices");
const problemSection = document.querySelector("#problem-section");
const problemSectionTitle = document.querySelector("#problem-section-title");
const addProblemButton = document.querySelector("#add-problem");
const problemEmpty = document.querySelector("#problem-empty");
const problemSearch = document.querySelector("#problem-search");
const problemDifficultyFilterButtons = document.querySelector("#problem-difficulty-filter");
const problemSort = document.querySelector("#problem-sort");
const problemCount = document.querySelector("#problem-count");
const problemPages = document.querySelector("#problem-pages");
const problemSelectToggle = document.querySelector("#problem-select-toggle");
const problemBulk = document.querySelector("#problem-bulk");
const problemSelectPage = document.querySelector("#problem-select-page");
const problemSelectAll = document.querySelector("#problem-select-all");
const problemSelectAllLabel = document.querySelector("#problem-select-all-label");
const problemSelectedCount = document.querySelector("#problem-selected-count");
const problemBulkDifficulty = document.querySelector("#problem-bulk-difficulty");
const problemBulkDelete = document.querySelector("#problem-bulk-delete");
const problemList = document.querySelector("#problem-list");
const problemBackButton = document.querySelector("#problem-back-button");
const deleteOpenProblemButton = document.querySelector("#delete-open-problem");
const duplicateOpenProblemButton = document.querySelector("#duplicate-open-problem");
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
const createContestMode = document.querySelector("#create-contest-mode");
const contestModeChoices = document.querySelector("#contest-mode-choices");
const contestModeNote = document.querySelector("#contest-mode-note");
const contestTeamLead = document.querySelector("#contest-team-lead");
const contestLeaderboardHeading = document.querySelector("#contest-leaderboard-heading");
const testingTeamView = document.querySelector("#testing-team-view");
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
const teamMembersInput = document.querySelector("#team-members");
const teamSubmitButton = document.querySelector("#team-submit");
const teamCancelEdit = document.querySelector("#team-cancel-edit");
const teamEditNote = document.querySelector("#team-edit-note");
const contestTeamNote = document.querySelector("#contest-team-note");
const contestCountdown = document.querySelector("#contest-countdown");
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
const studentCountdown = document.querySelector("#student-countdown");
const studentPlayMeta = document.querySelector("#student-play-meta");
const spawnAgreement = document.querySelector("#spawn-agreement");
const spawnVoteList = document.querySelector("#spawn-votes");
const spawnAgreementNote = document.querySelector("#spawn-agreement-note");
const teamRoster = document.querySelector("#team-roster");
const teamRosterBody = document.querySelector("#team-roster-body");
const pageToast = document.querySelector("#page-toast");
const pageToastMessage = document.querySelector("#page-toast-message");
const pageToastClose = document.querySelector("#page-toast-close");
const studentSpawnNote = document.querySelector("#student-spawn-note");
const studentJoined = document.querySelector("#student-joined");
const studentTeamSummary = document.querySelector("#student-team-summary");
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
const studentAnswerSuccess = document.querySelector("#student-answer-success");

// ═══════════════════════════════════════════════════════════════════
// In-memory state (populated by bootstrap)
// ═══════════════════════════════════════════════════════════════════

let problems = [];
let maps = [];
let contests = [];
let versions = [];
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
let problemQuery = "";
let problemDifficultyFilter = "all";
let problemSortMode = "index";
let problemPage = 1;
const PROBLEM_PAGE_SIZE = 20;
const selectedProblemKeys = new Set();
let problemSelectMode = false;
let mapSnapshot = null;
let mapDirty = false;
let problemDraft = null;
let pendingProblemDraft = null;
let problemDirty = false;
let newMapMode = "official";
let placeType = "math";
let placeMode = "manual";
let placePickSource = "random";
const placePickTypes = new Set(["math"]);
const placePickDifficulties = new Set(["easy", "normal", "hard", "insane"]);
let serverOffsetMs = 0;
const revisions = { maps: 0, problems: 0, contests: 0 };
const saveQueues = { maps: Promise.resolve(), problems: Promise.resolve(), contests: Promise.resolve() };
let contestClock = null;
let shownPhase = "";
let shownListPhases = "";
let editingTeamId = null;
let newContestMode = "competition";
let adminViewTeamId = null;
let accountFilter = "all";
let accountQuery = "";
let accountStatusTimer = null;
let pageToastTimer = null;
const spawnAgreementCache = new Map();
const ANSWER_OPEN_MODE_KEY = "territory-answer-open-mode";
let answerOpenMode = readAnswerOpenMode();

// The student page and each admin page are separate documents. Hash routing
// runs only when every view is on the same page.
const ROUTED = Boolean(homeView && mapsView && problemsView && competitionsView && settingsView && tutorialView && creditsView);
let routeApplying = false;
let routeLast = "";

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
  if (!r.ok) {
    const error = new Error(data.message || `HTTP ${r.status}`);
    error.status = r.status;
    error.data = data;
    throw error;
  }
  return data;
}

function debounce(fn, ms = 500) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const _persistMapsDebounced = debounce(() => { persistMapsNow(); }, 600);
const _persistProblemsDebounced = debounce(() => { persistProblemsNow(); }, 600);
const _persistContestsDebounced = debounce(() => { persistContestsNow(); }, 600);

// ═══════════════════════════════════════════════════════════════════
// Routing
// ═══════════════════════════════════════════════════════════════════
//
// The full app uses hash routes so every view has its own URL and the
// browser Back and Forward buttons work without server rewrites:
//
//   #/home
//   #/maps                         #/maps/<mapId>
//   #/maps/<mapId>/problem/<type>/<index>
//   #/problems                     #/problems/<type>
//   #/problems/<type>/<index>
//   #/contests                     #/contests/<contestId>
//   #/student                      #/student/<contestId>
//   #/settings                     #/tutorial                     #/credits
//
function routeFromPath(path) {
  const parts = (Array.isArray(path) ? path : String(path || "").split("/"))
    .map((part) => String(part ?? "").trim())
    .filter((part) => part.length > 0);
  return { name: parts[0] || "home", parts: parts.slice(1) };
}

function splitPageUrl(path) {
  const route = routeFromPath(path);
  const contestant = isContestant();
  if (route.name === "home") return contestant ? "/index.html" : "/admin/maps.html";
  if (route.name === "student" || (route.name === "contests" && contestant)) {
    return route.parts[0] ? `/index.html?contest=${encodeURIComponent(route.parts[0])}` : "/index.html";
  }
  if (route.name === "settings" && contestant) return "/index.html?settings=1";
  if (route.name === "maps") {
    if (route.parts[1] === "problem") {
      const params = new URLSearchParams({
        type: route.parts[2] || "",
        index: route.parts[3] || "",
        from: "map",
        map: route.parts[0] || "",
      });
      return `/admin/problems.html?${params.toString()}`;
    }
    return route.parts[0] ? `/admin/maps.html?map=${encodeURIComponent(route.parts[0])}` : "/admin/maps.html";
  }
  if (route.name === "problems") {
    if (route.parts[1] === "batch") return `/admin/problems.html?type=${encodeURIComponent(route.parts[0])}&batch=1`;
    if (route.parts[1]) return `/admin/problems.html?type=${encodeURIComponent(route.parts[0])}&index=${encodeURIComponent(route.parts[1])}`;
    if (route.parts[0]) return `/admin/problems.html?type=${encodeURIComponent(route.parts[0])}`;
    return "/admin/problems.html";
  }
  if (route.name === "contests") {
    return route.parts[0] ? `/admin/contest.html?id=${encodeURIComponent(route.parts[0])}` : "/admin/contest.html";
  }
  if (route.name === "tutorial") return "/admin/tutorial.html";
  if (route.name === "credits") return "/admin/credits.html";
  if (route.name === "settings") return "/admin/settings.html";
  return contestant ? "/index.html" : "/admin/maps.html";
}

function routeHash(path) {
  const parts = Array.isArray(path) ? path : String(path || "").split("/");
  const clean = parts
    .map((part) => String(part ?? "").trim())
    .filter((part) => part.length > 0);
  return `#/${clean.map((part) => encodeURIComponent(part)).join("/")}`;
}

function decodeRoutePart(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function parseRoute(hash = location.hash) {
  const raw = String(hash || "").replace(/^#\/?/, "").replace(/\/+$/, "");
  if (!raw) return { name: "home", parts: [] };
  const [name, ...parts] = raw.split("/").map(decodeRoutePart);
  return { name: name || "home", parts };
}

function defaultRouteHash() {
  return isContestant() ? "#/student" : "#/maps";
}

function navigateTo(path, options = {}) {
  if (!ROUTED) {
    const route = routeFromPath(path);
    if (!canLeaveRoute(route)) return;
    const url = splitPageUrl(path);
    const current = `${location.pathname}${location.search}`;
    if (url === current) {
      openSplitPage();
      return;
    }
    const nextPath = new URL(url, location.origin).pathname;
    if (nextPath === location.pathname) {
      if (options.replace) history.replaceState(null, "", url);
      else history.pushState(null, "", url);
      openSplitPage();
      return;
    }
    if (options.replace) location.replace(url);
    else location.assign(url);
    return;
  }
  const hash = routeHash(path);
  if (hash === location.hash) {
    if (bootstrapped) applyRoute();
    return;
  }
  if (!bootstrapped) {
    history.replaceState(null, "", hash);
    return;
  }
  const route = parseRoute(hash);
  if (!canLeaveRoute(route)) return;
  if (options.replace) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
  applyRoute();
}

function setHashSilently(path) {
  if (!ROUTED) {
    const url = splitPageUrl(path);
    if (`${location.pathname}${location.search}` !== url) history.replaceState(null, "", url);
    return;
  }
  const hash = routeHash(path);
  if (location.hash !== hash) history.replaceState(null, "", hash);
  routeLast = hash;
}

function canLeaveRoute(route) {
  if (problemEditorView && !problemEditorView.hidden) {
    const sameProblem = route.name === "problems"
      && route.parts[0] === editingProblemType
      && Number(route.parts[1]) === editingProblemNo;
    const sameMapProblem = route.name === "maps"
      && route.parts[0] === openMapId
      && route.parts[1] === "problem"
      && route.parts[2] === editingProblemType
      && Number(route.parts[3]) === editingProblemNo;
    if (!sameProblem && !sameMapProblem && !discardUnsavedProblem()) return false;
  }
  if (editorView && !editorView.hidden) {
    const sameMap = route.name === "maps" && route.parts[0] === openMapId;
    if (!sameMap && !discardUnsavedMap()) return false;
  }
  return true;
}

function onLocationChange() {
  if (!ROUTED || routeApplying || !bootstrapped || !isSignedIn()) return;
  if (location.hash === routeLast) return;
  applyRoute();
}

function startRouter() {
  if (!ROUTED) return;
  window.addEventListener("popstate", onLocationChange);
  window.addEventListener("hashchange", onLocationChange);
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    history.replaceState(null, "", defaultRouteHash());
  }
  routeLast = location.hash;
  applyRoute();
}

function routeViewLabel(route) {
  if (!route) return "Territory Game";
  if (route.name === "maps" && route.parts[0]) {
    const map = maps.find((item) => item.id === route.parts[0]);
    if (route.parts[1] === "problem") return "Problem editor";
    return map ? map.name : "Maps";
  }
  if (route.name === "problems" && route.parts[1] === "batch") return "Batch add";
  if (route.name === "problems" && route.parts[1]) return "Problem editor";
  if (route.name === "contests" && route.parts[0]) {
    const contest = contests.find((item) => item.id === route.parts[0]);
    return contest ? contest.name : "Contests";
  }
  if (route.name === "student" && route.parts[0]) {
    const contest = contests.find((item) => item.id === route.parts[0]);
    return contest ? contest.name : "Contests";
  }
  if (route.name === "maps") return "Maps";
  if (route.name === "problems") return "Problems";
  if (route.name === "contests" || route.name === "student") return "Contests";
  if (route.name === "settings") return isContestant() ? "Settings" : "Accounts";
  if (route.name === "tutorial") return "Tutorial";
  if (route.name === "credits") return "Credits";
  return "Home";
}

function applyRoute() {
  if (!ROUTED || !bootstrapped || !isSignedIn()) return;
  const hash = location.hash || defaultRouteHash();
  const route = parseRoute(hash);
  if (!canLeaveRoute(route)) {
    if (routeLast) history.replaceState(null, "", routeLast);
    return;
  }

  routeApplying = true;
  let canonical = hash;
  try {
    canonical = renderRoute(route) || hash;
  } catch (error) {
    console.error("[route]", error);
    showPageToast(error?.message || "Could not open that page.", "warn");
    if (isContestant()) showStudent();
    else if (route.name === "maps") showMaps();
    else showHome();
    canonical = route.name === "maps" ? "#/maps" : defaultRouteHash();
  } finally {
    routeApplying = false;
  }

  if (canonical !== location.hash) history.replaceState(null, "", canonical);
  routeLast = canonical;
  document.title = `${routeViewLabel(parseRoute(canonical))} · Territory Game`;
}

function renderRoute(route) {
  const admin = isAdmin();
  const contestant = isContestant();

  switch (route.name) {
    case "home": {
      if (contestant) {
        showStudent();
        return "#/student";
      }
      showHome();
      return "#/home";
    }

    case "maps": {
      if (!admin) {
        showStudent();
        return "#/student";
      }
      const mapId = route.parts[0];
      const problemType = route.parts[2];
      const problemIndex = Number(route.parts[3]);
      if (mapId && route.parts[1] === "problem") {
        const map = maps.find((item) => item.id === mapId);
        if (map && typeInfo(problemType) && Number.isInteger(problemIndex)) {
          openMapId = map.id;
          openContestId = null;
          showProblemEditor(problemIndex, problemType, true);
          return routeHash(["maps", mapId, "problem", problemType, String(problemIndex)]);
        }
      }
      if (mapId && maps.some((map) => map.id === mapId)) {
        showEditor(mapId);
        return routeHash(["maps", mapId]);
      }
      showMaps();
      return "#/maps";
    }

    case "problems": {
      if (!admin) {
        showStudent();
        return "#/student";
      }
      const type = route.parts[0];
      if (typeInfo(type)) {
        activeProblemType = type;
        if (route.parts[1] === "batch") {
          showProblemBatch(type);
          return routeHash(["problems", type, "batch"]);
        }
        const index = Number(route.parts[1]);
        if (Number.isInteger(index)) {
          showProblemEditor(index, type, false);
          return routeHash(["problems", type, String(index)]);
        }
        showProblems();
        return routeHash(["problems", type]);
      }
      activeProblemType = null;
      showProblems();
      return "#/problems";
    }

    case "contests": {
      if (!admin) {
        if (route.parts[0] && teamForUser(contests.find((item) => item.id === route.parts[0]))) {
          showStudentPlay(route.parts[0]);
          return routeHash(["student", route.parts[0]]);
        }
        showStudent();
        return "#/student";
      }
      const contestId = route.parts[0];
      if (contestId && contests.some((contest) => contest.id === contestId)) {
        showContest(contestId);
        return routeHash(["contests", contestId]);
      }
      showCompetitions();
      return "#/contests";
    }

    case "student": {
      if (!contestant) {
        showCompetitions();
        return "#/contests";
      }
      const contestId = route.parts[0];
      if (contestId && teamForUser(contests.find((contest) => contest.id === contestId))) {
        showStudentPlay(contestId);
        return routeHash(["student", contestId]);
      }
      showStudent();
      return "#/student";
    }

    case "settings": {
      showSettings();
      return "#/settings";
    }

    case "tutorial": {
      if (!admin) {
        showStudent();
        return "#/student";
      }
      showTutorial();
      return "#/tutorial";
    }

    case "credits": {
      showCredits();
      return "#/credits";
    }

    default: {
      if (contestant) {
        showStudent();
        return "#/student";
      }
      showHome();
      return "#/home";
    }
  }
}
// ═══════════════════════════════════════════════════════════════════
// Event wiring
// ═══════════════════════════════════════════════════════════════════

homeButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo(isContestant() ? "student" : "maps");
});
mobileHome?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo(isContestant() ? "student" : "maps");
});
menuButton?.addEventListener("click", () => setMenuOpen(!document.body.classList.contains("menu-open")));
sidebarBackdrop?.addEventListener("click", () => setMenuOpen(false));
document.querySelector(".sidebar")?.addEventListener("click", (event) => {
  if (!event.target.closest("button, input, a, textarea")) setMenuOpen(false);
  else if (event.target.closest("button, a")) setMenuOpen(false);
});
document.querySelector("main")?.addEventListener("click", () => {
  if (document.body.classList.contains("menu-open")) setMenuOpen(false);
});
// The problem panel is closed only by the Close button. Clicking the
// backdrop and Escape do not dismiss it.
studentProblemClose?.addEventListener("click", closeStudentProblem);
document?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setMenuOpen(false);
});
document?.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
  if (!problemEditorView || problemEditorView.hidden) return;
  event.preventDefault();
  saveOpenProblem();
});
mapsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("maps");
});
problemsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("problems");
});
competitionsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo(isContestant() ? "student" : "contests");
});
tutorialButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("tutorial");
});
creditsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("credits");
});
settingsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("settings");
});
accountForm?.addEventListener("submit", createAccount);
accountList?.addEventListener("click", onAccountListClick);
accountSearch?.addEventListener("input", () => {
  accountQuery = accountSearch.value.trim();
  renderAccounts();
});
accountFilters?.addEventListener("click", onAccountFilterClick);
answerOpenModeChoices?.addEventListener("click", onAnswerModeClick);
accountButton?.addEventListener("click", logOut);
versionForm?.addEventListener("submit", addVersion);
pageToastClose?.addEventListener("click", hidePageToast);
createContestForm?.addEventListener("submit", createContest);
createContestMode?.addEventListener("click", onCreateContestModeClick);
contestModeChoices?.addEventListener("click", onContestModeClick);
testingTeamView?.addEventListener("click", onTestingTeamViewClick);
contestList?.addEventListener("click", onContestListClick);
contestBackButton?.addEventListener("click", () => navigateTo("contests"));
deleteOpenContestButton?.addEventListener("click", deleteOpenContest);
contestForm?.addEventListener("submit", (event) => event.preventDefault());
contestNameField?.addEventListener("input", commitContestName);
contestNameField?.addEventListener("change", () => {
  const contest = currentContest();
  if (contest && !readContestName(contestNameField.value)) contestNameField.value = contest.name;
});
contestMapField?.addEventListener("change", commitContestMap);
contestMapSelect?.addEventListener("change", () => updateContestSpawnNote(contestMapSelect, contestMapNote));
contestStartField?.addEventListener("input", commitContestSchedule);
contestDurationField?.addEventListener("input", commitContestSchedule);
contestSpawnField?.addEventListener("input", commitContestSchedule);
contestReadyField?.addEventListener("input", commitContestSchedule);
contestStartField?.addEventListener("change", finishContestScheduleEdit);
contestDurationField?.addEventListener("change", finishContestScheduleEdit);
contestSpawnField?.addEventListener("change", finishContestScheduleEdit);
contestReadyField?.addEventListener("change", finishContestScheduleEdit);
teamForm?.addEventListener("submit", saveTeam);
teamCancelEdit?.addEventListener("click", cancelTeamEdit);
contestantList?.addEventListener("click", onContestantListClick);
studentContestList?.addEventListener("click", onStudentListClick);
studentBack?.addEventListener("click", () => navigateTo("student"));
studentGrid?.addEventListener("click", onStudentGridClick);
studentAnswerForm?.addEventListener("submit", submitStudentAnswer);
problemSectionChoices?.addEventListener("click", onProblemSectionClick);
problemSection?.addEventListener("click", onProblemListClick);
problemSection?.addEventListener("change", onProblemSelectionChange);
problemSearch?.addEventListener("input", onProblemSearchInput);
problemSearch?.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && problemSearch.value) {
    problemSearch.value = "";
    onProblemSearchInput();
  }
});
problemDifficultyFilterButtons?.addEventListener("click", onProblemDifficultyFilterClick);
problemSort?.addEventListener("change", onProblemSortChange);
problemSelectToggle?.addEventListener("click", toggleProblemSelectMode);
problemSelectPage?.addEventListener("change", selectProblemPage);
problemSelectAll?.addEventListener("change", selectAllProblems);
problemBulkDifficulty?.addEventListener("click", onBulkDifficultyClick);
problemBulkDelete?.addEventListener("click", deleteSelectedProblems);
placeTypeChoices?.addEventListener("click", onPlaceTypeClick);
problemBackButton?.addEventListener("click", closeProblemEditor);
deleteOpenProblemButton?.addEventListener("click", deleteOpenProblem);
duplicateOpenProblemButton?.addEventListener("click", duplicateCurrentProblem);
problemEditorForm?.addEventListener("submit", (event) => event.preventDefault());
problemIndexInput?.addEventListener("change", () => {
  if (problemReturn === "map") return;
  commitProblemIndex();
});
problemIndexInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    problemIndexInput.blur();
  }
});
problemTypeChoices?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-problem-type]");
  if (!button || editingProblemNo === null || problemReturn === "map") return;
  setProblemType(editingProblemNo, button.dataset.problemType);
});
problemDifficultyChoices?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-problem-difficulty]");
  if (!button || editingProblemNo === null) return;
  setProblemDifficulty(button.dataset.problemDifficulty);
});
problemPrompt?.addEventListener("input", () => {
  updateProblemField("prompt", problemPrompt.value);
  requestAnimationFrame(renderProblemPreview);
});
problemAnswer?.addEventListener("input", () => {
  updateProblemField("answer", problemAnswer.value);
  requestAnimationFrame(renderProblemPreview);
});
problemLogic?.addEventListener("input", () => {
  updateProblemField("logic", problemLogic.value);
});
backButton?.addEventListener("click", () => {
  if (ROUTED) navigateTo("maps");
  else showMaps();
});
saveMapButton?.addEventListener("click", saveOpenMap);
saveProblemButton?.addEventListener("click", saveOpenProblem);
saveProblemTopButton?.addEventListener("click", saveOpenProblem);
deleteOpenMapButton?.addEventListener("click", deleteOpenMap);
createForm?.addEventListener("submit", createMap);
createMapMode?.addEventListener("click", onCreateMapModeClick);
mapModeChoices?.addEventListener("click", onMapModeClick);
editorNameInput?.addEventListener("input", commitMapName);
editorNameInput?.addEventListener("change", () => {
  const map = currentMap();
  if (map && !readMapName(editorNameInput.value)) editorNameInput.value = map.name;
});
mapList?.addEventListener("click", onMapListClick);
kindProblem?.addEventListener("click", () => chooseTool("problem"));
kindSpawnpoint?.addEventListener("click", () => chooseTool("spawnpoint"));
kindObstacle?.addEventListener("click", () => chooseTool("obstacle"));
kindEmpty?.addEventListener("click", () => chooseTool("empty"));
editorGrid?.addEventListener("pointerdown", startPaint);
placeModeChoices?.addEventListener("click", onPlaceModeClick);
placePickTypeChoices?.addEventListener("click", onPlacePickTypeClick);
placePickDifficultyChoices?.addEventListener("click", onPlacePickDifficultyClick);
placePickSourceChoices?.addEventListener("click", onPlacePickSourceClick);
problemNoInput?.addEventListener("input", () => {
  problemNoError.hidden = true;
});
// ═══════════════════════════════════════════════════════════════════
// Persistence
// ═══════════════════════════════════════════════════════════════════

function handleSaveError(error, collection) {
  console.error("[save]", error);
  const conflict = Number(error?.status) === 409 || /changed in another tab/i.test(error?.message || "");
  if (collection === "maps") {
    mapDirty = true;
    updateMapSaveButton();
  } else if (collection === "problems") {
    problemDirty = true;
    updateProblemSaveButton();
  }
  if (conflict) {
    if (!saveConflictActive) openSaveConflict(collection);
    return;
  }
  showPageToast(error?.message || "Could not save changes.", "warn");
}

function queueSave(name, task) {
  const next = saveQueues[name].catch(() => {}).then(task);
  saveQueues[name] = next.catch(() => {});
  return next;
}

function noteRevision(name, data) {
  if (Number.isInteger(data?.revision)) revisions[name] = data.revision;
}

async function persistMapsNow() {
  if (!bootstrapped || !isAdmin()) return null;
  if (saveConflictActive) return null;
  return queueSave("maps", async () => {
    try {
      const data = await apiCall("save-maps", { maps, revision: revisions.maps });
      noteRevision("maps", data);
      return data;
    } catch (error) {
      handleSaveError(error, "maps");
      return null;
    }
  });
}

async function persistProblemsNow() {
  if (!bootstrapped || !isAdmin()) return null;
  if (saveConflictActive) return null;
  return queueSave("problems", async () => {
    try {
      const data = await apiCall("save-problems", { problems, revision: revisions.problems });
      noteRevision("problems", data);
      return data;
    } catch (error) {
      handleSaveError(error, "problems");
      return null;
    }
  });
}

async function persistContestsNow() {
  if (!bootstrapped || !isAdmin()) return null;
  if (contests.some((contest) => !contestSchedule(contest))) return null;
  if (saveConflictActive) return null;
  return queueSave("contests", async () => {
    try {
      const data = await apiCall("save-contests", { contests, revision: revisions.contests });
      noteRevision("contests", data);
      return data;
    } catch (error) {
      handleSaveError(error, "contests");
      return null;
    }
  });
}

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
  if (!bootstrapped || !isAdmin()) return null;
  if (contests.some((contest) => !contestSchedule(contest))) {
    throw new Error("Finish the contest schedule before adding a team.");
  }
  if (saveConflictActive) return null;
  return queueSave("contests", async () => {
    try {
      const data = await apiCall("save-contests", { contests, revision: revisions.contests });
      noteRevision("contests", data);
      return data;
    } catch (error) {
      handleSaveError(error, "contests");
      throw error;
    }
  });
}

function markMapDirty() {
  mapDirty = true;
  if (saveMapButton) saveMapButton.disabled = false;
}

function updateMapSaveButton() {
  if (saveMapButton) saveMapButton.disabled = !mapDirty;
}

async function saveOpenMap() {
  if (!mapDirty || !bootstrapped || !isAdmin()) return;
  const saved = await persistMapsNow();
  if (!saved) return;
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
  const saveable = Boolean(problemDraft && (problemDraft.isNew || problemDirty));
  if (saveProblemButton) saveProblemButton.disabled = !saveable;
  if (saveProblemTopButton) saveProblemTopButton.disabled = !saveable;
  if (!problemSaveState) return;
  if (!problemDraft) {
    problemSaveState.textContent = "";
    problemSaveState.dataset.state = "idle";
    return;
  }
  if (problemDirty) {
    problemSaveState.textContent = "Unsaved changes";
    problemSaveState.dataset.state = "dirty";
  } else if (problemDraft.isNew) {
    problemSaveState.textContent = "New problem — not saved yet";
    problemSaveState.dataset.state = "new";
  } else {
    problemSaveState.textContent = "Saved";
    problemSaveState.dataset.state = "saved";
  }
}

function problemHasUnsavedEdits() {
  if (!problemDraft) return false;
  if (problemDirty) return true;
  if (!problemDraft.isNew) return false;
  return Boolean(problemPrompt.value.trim() || problemAnswer.value.trim() || problemLogic.value.trim());
}

function discardUnsavedProblem() {
  if (!problemEditorView || problemEditorView.hidden || !problemHasUnsavedEdits()) {
    if (problemEditorView && !problemEditorView.hidden) problemDraft = null;
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
    persistProblemsNow();
  }
  updateProblemSaveButton();
}
// ═══════════════════════════════════════════════════════════════════
// Save conflict resolution
// ═══════════════════════════════════════════════════════════════════

let saveConflictActive = false;
let conflictState = null;

const CONFLICT_COLLECTION_LABELS = {
  maps: "Maps",
  problems: "Problems",
  contests: "Contests",
};

const CONFLICT_FIELDS = {
  maps: [
    { key: "name", label: "Name" },
    { key: "mode", label: "Type" },
    { key: "geometry", label: "Size and cells" },
  ],
  problems: [
    { key: "prompt", label: "Problem" },
    { key: "answer", label: "Answer" },
    { key: "logic", label: "Logic" },
    { key: "difficulty", label: "Difficulty" },
  ],
  contests: [
    { key: "name", label: "Name" },
    { key: "mapId", label: "Map" },
    { key: "startAt", label: "Start time" },
    { key: "durationMinutes", label: "Duration" },
    { key: "spawnMinutes", label: "Spawn time" },
    { key: "readyMinutes", label: "Wait after spawn" },
  ],
};

function conflictClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function conflictCollection(name) {
  if (name === "maps") return maps;
  if (name === "problems") return problems;
  return contests;
}

function conflictSetCollection(name, value) {
  if (name === "maps") maps = value;
  else if (name === "problems") problems = value;
  else contests = value;
}

function conflictFocusKeys(collection) {
  if (collection === "maps" && editorView && !editorView.hidden && openMapId) {
    return new Set([String(openMapId)]);
  }
  if (collection === "problems" && problemEditorView && !problemEditorView.hidden && editingProblemType && Number.isInteger(editingProblemNo)) {
    return new Set([`${editingProblemType}:${editingProblemNo}`]);
  }
  if (collection === "problems" && batchView && !batchView.hidden && batchRows) {
    const keys = new Set();
    for (const row of batchRows.querySelectorAll("[data-batch-index]")) {
      const index = Number(row.value);
      if (Number.isInteger(index) && batchType) keys.add(`${batchType}:${index}`);
    }
    if (keys.size > 0) return keys;
  }
  if (collection === "contests" && contestView && !contestView.hidden && openContestId) {
    return new Set([String(openContestId)]);
  }
  return null;
}

function conflictKey(name, item) {
  if (name === "problems") return `${item.type}:${item.index}`;
  return String(item.id || "");
}

function conflictProblemTag(item) {
  if (typeof problemTag === "function") return problemTag(item.index, item.type);
  return `${String(item.type || "").toUpperCase()}${item.index}`;
}

function conflictLabel(name, item) {
  if (name === "maps") return `Map · ${item.name || item.id}`;
  if (name === "problems") return `Problem · ${conflictProblemTag(item)}`;
  return `Contest · ${item.name || item.id}`;
}

function conflictMapGeometry(map) {
  return { cols: map.cols, rows: map.rows, cells: map.cells };
}

function conflictMapSummary(map) {
  const counts = typeof mapKindCounts === "function"
    ? mapKindCounts(map)
    : { problem: 0, obstacle: 0, spawnpoint: 0, empty: 0 };
  return `${map.cols}×${map.rows} · ${counts.problem} problems · ${counts.obstacle} obstacles · ${counts.spawnpoint} spawns · ${counts.empty} empty`;
}

function conflictCellKind(cell) {
  if (!cell) return "missing";
  if (cell.kind === "problem") return `${String(cell.type || "").toUpperCase()}${cell.problemNo}`;
  return cell.kind || "empty";
}

function conflictChangedCells(a, b) {
  const left = a?.cells || [];
  const right = b?.cells || [];
  const cols = a?.cols || b?.cols || 1;
  const items = [];
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    if (JSON.stringify(left[i]) !== JSON.stringify(right[i])) {
      items.push({
        index: i,
        row: Math.floor(i / cols) + 1,
        column: (i % cols) + 1,
        local: conflictCellKind(left[i]),
        remote: conflictCellKind(right[i]),
      });
    }
  }
  return { count: items.length, items };
}

function conflictFieldValue(name, item, field) {
  if (name === "maps" && field === "geometry") return conflictMapGeometry(item);
  return item?.[field];
}

function conflictFormatValue(name, field, value) {
  if (value === undefined || value === null) return "(empty)";
  if (name === "maps" && field === "mode") return value === "testing" ? "Testing" : "Official";
  if (name === "maps" && field === "geometry") return conflictMapSummary(value);
  if (field === "startAt" && Number.isFinite(Number(value))) {
    return `${new Date(Number(value)).toLocaleString()} (${value})`;
  }
  if (typeof value === "string") return value || "(empty)";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function conflictItemSummary(name, item) {
  if (name === "maps") return conflictMapSummary(item);
  if (name === "problems") {
    const prompt = String(item.prompt || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return prompt ? prompt.slice(0, 220) : "(empty problem)";
  }
  return `Starts ${new Date(Number(item.startAt)).toLocaleString()} · ${item.durationMinutes} min · spawn ${item.spawnMinutes} · wait ${item.readyMinutes}`;
}

function conflictValuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function conflictBuildRecords(name, localItems, remoteItems) {
  const localByKey = new Map(localItems.map((item) => [conflictKey(name, item), item]));
  const remoteByKey = new Map(remoteItems.map((item) => [conflictKey(name, item), item]));
  const keys = new Set([...localByKey.keys(), ...remoteByKey.keys()]);
  const records = [];

  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    if (!remote) {
      records.push({ key, kind: "added", local, remote: null, fields: [] });
      continue;
    }
    if (!local) {
      records.push({ key, kind: "deleted", local: null, remote, fields: [] });
      continue;
    }
    const fields = [];
    for (const field of CONFLICT_FIELDS[name]) {
      const localValue = conflictFieldValue(name, local, field.key);
      const remoteValue = conflictFieldValue(name, remote, field.key);
      if (conflictValuesEqual(localValue, remoteValue)) continue;
      const item = {
        key: field.key,
        label: field.label,
        local: localValue,
        remote: remoteValue,
      };
      if (name === "maps" && field.key === "geometry") {
        const cellDiff = conflictChangedCells(localValue, remoteValue);
        item.changedCells = cellDiff.count;
        item.cellDiffs = cellDiff.items;
      }
      fields.push(item);
    }
    if (fields.length > 0) records.push({ key, kind: "changed", local, remote, fields });
  }

  records.sort((a, b) => {
    const aItem = a.local || a.remote;
    const bItem = b.local || b.remote;
    return conflictLabel(name, aItem).localeCompare(conflictLabel(name, bItem));
  });
  return records;
}

function conflictNewChoice(record) {
  if (record.kind === "added") return { keep: true };
  if (record.kind === "deleted") return { keepServer: true };
  return {
    fields: Object.fromEntries(record.fields.map((field) => [field.key, "local"])),
  };
}

function ensureConflictModal() {
  let modal = document.querySelector("#conflict-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "conflict-modal";
  modal.className = "conflict-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "conflict-title");

  const dialog = document.createElement("section");
  dialog.className = "conflict-dialog";

  const header = document.createElement("header");
  header.className = "conflict-header";
  const title = document.createElement("h2");
  title.id = "conflict-title";
  title.textContent = "Resolve save conflict";
  const close = document.createElement("button");
  close.id = "conflict-close";
  close.type = "button";
  close.className = "conflict-close";
  close.setAttribute("aria-label", "Close conflict resolver");
  close.textContent = "×";
  header.append(title, close);

  const body = document.createElement("div");
  body.id = "conflict-body";
  body.className = "conflict-body";

  const footer = document.createElement("footer");
  footer.className = "conflict-footer";
  const error = document.createElement("p");
  error.id = "conflict-error";
  error.className = "form-error";
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "conflict-actions";
  const apply = document.createElement("button");
  apply.id = "conflict-apply";
  apply.type = "button";
  apply.className = "save-changes";
  apply.textContent = "Apply choices & save";
  const server = document.createElement("button");
  server.id = "conflict-server";
  server.type = "button";
  server.className = "account-action";
  server.textContent = "Use server for all";
  const mine = document.createElement("button");
  mine.id = "conflict-mine";
  mine.type = "button";
  mine.className = "account-action";
  mine.textContent = "Keep mine for all";
  actions.append(apply, server, mine);
  footer.append(error, actions);

  dialog.append(header, body, footer);
  modal.append(dialog);
  document.body.append(modal);

  close.addEventListener("click", () => closeConflictModal());
  apply.addEventListener("click", () => applyConflict("choices"));
  server.addEventListener("click", () => applyConflict("server"));
  mine.addEventListener("click", () => applyConflict("mine"));
  return modal;
}

function setConflictBusy(busy) {
  for (const id of ["#conflict-apply", "#conflict-server", "#conflict-mine", "#conflict-close"]) {
    const button = document.querySelector(id);
    if (button) button.disabled = busy;
  }
}

function setConflictError(message) {
  const error = document.querySelector("#conflict-error");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message || "";
}

function showConflictLoading(collection) {
  const modal = ensureConflictModal();
  const body = document.querySelector("#conflict-body");
  const title = document.querySelector("#conflict-title");
  if (title) title.textContent = "Resolve save conflict";
  if (body) {
    body.replaceChildren();
    const p = document.createElement("p");
    p.className = "conflict-loading";
    p.textContent = `Fetching the latest ${CONFLICT_COLLECTION_LABELS[collection] || "data"} from the server…`;
    body.append(p);
  }
  setConflictError("");
  setConflictBusy(true);
  modal.hidden = false;
}

function conflictRadio(name, value, checked, onChange, labelText) {
  const label = document.createElement("label");
  label.className = "conflict-choice";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.addEventListener("change", () => {
    if (input.checked) onChange(value);
  });
  label.append(input, document.createTextNode(labelText || value));
  return label;
}

function conflictValueBlock(kind, labelText, value, name, field) {
  const block = document.createElement("div");
  block.className = `conflict-value conflict-value-${kind}`;
  const title = document.createElement("span");
  title.className = "conflict-value-title";
  title.textContent = `${kind === "local" ? "+" : "-"} ${labelText}`;
  const pre = document.createElement("pre");
  pre.textContent = conflictFormatValue(name, field, value);
  block.append(title, pre);
  return block;
}

function renderConflictRecords() {
  const state = conflictState;
  if (!state) return;
  const body = document.querySelector("#conflict-body");
  const title = document.querySelector("#conflict-title");
  if (!body) return;
  if (title) title.textContent = `${CONFLICT_COLLECTION_LABELS[state.collection]} conflict`;

  body.replaceChildren();
  const intro = document.createElement("p");
  intro.className = "conflict-intro";
  intro.textContent = state.focused
    ? "Another admin saved first. This only shows the page you have open. Everything else stays as the server saved it."
    : "Another admin saved first. Choose what to keep. Nothing is overwritten until you apply.";
  body.append(intro);

  if (state.records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "conflict-empty";
    empty.textContent = "No content differences were found. The other change may only affect server-managed team or game state.";
    body.append(empty);
    setConflictBusy(false);
    const apply = document.querySelector("#conflict-apply");
    const mine = document.querySelector("#conflict-mine");
    if (apply) apply.disabled = true;
    if (mine) mine.disabled = true;
    return;
  }

  state.records.forEach((record, index) => {
    const item = record.local || record.remote;
    const card = document.createElement("article");
    card.className = "conflict-record";
    card.dataset.conflictIndex = String(index);

    const head = document.createElement("div");
    head.className = "conflict-record-head";
    const heading = document.createElement("h3");
    heading.textContent = conflictLabel(state.collection, item);
    const badge = document.createElement("span");
    badge.className = `conflict-badge conflict-badge-${record.kind}`;
    badge.textContent = record.kind === "added"
      ? "Only mine"
      : record.kind === "deleted"
        ? "Only server"
        : `${record.fields.length} changed`;
    head.append(heading, badge);
    card.append(head);

    if (record.kind === "added" || record.kind === "deleted") {
      const summary = document.createElement("p");
      summary.className = "conflict-record-summary";
      summary.textContent = conflictItemSummary(state.collection, item);
      card.append(summary);
      const choices = document.createElement("div");
      choices.className = "conflict-choices";
      const choice = state.choices[index];
      if (record.kind === "added") {
        choices.append(
          conflictRadio(`conflict-${index}`, "keep", choice.keep, (value) => {
            state.choices[index].keep = value === "keep";
          }, "Keep my addition"),
          conflictRadio(`conflict-${index}`, "drop", !choice.keep, (value) => {
            state.choices[index].keep = value !== "drop";
          }, "Drop it")
        );
      } else {
        choices.append(
          conflictRadio(`conflict-${index}`, "keepServer", choice.keepServer, (value) => {
            state.choices[index].keepServer = value === "keepServer";
          }, "Keep server version"),
          conflictRadio(`conflict-${index}`, "delete", !choice.keepServer, (value) => {
            state.choices[index].keepServer = value !== "delete";
          }, "Delete it")
        );
      }
      card.append(choices);
      body.append(card);
      return;
    }

    const actions = document.createElement("div");
    actions.className = "conflict-record-actions";
    const useServer = document.createElement("button");
    useServer.type = "button";
    useServer.className = "account-action";
    useServer.textContent = "Use server for this item";
    const useMine = document.createElement("button");
    useMine.type = "button";
    useMine.className = "account-action";
    useMine.textContent = "Use mine for this item";
    actions.append(useMine, useServer);
    card.append(actions);

    for (const field of record.fields) {
      const fieldBox = document.createElement("div");
      fieldBox.className = "conflict-field";
      const fieldHead = document.createElement("div");
      fieldHead.className = "conflict-field-head";
      const label = document.createElement("h4");
      label.textContent = field.label;
      const choices = document.createElement("div");
      choices.className = "conflict-choices";
      const fieldChoice = state.choices[index].fields[field.key] || "local";
      const radioName = `conflict-${index}-${field.key}`;
      choices.append(
        conflictRadio(radioName, "local", fieldChoice === "local", (value) => {
          state.choices[index].fields[field.key] = value;
        }, "Mine"),
        conflictRadio(radioName, "remote", fieldChoice === "remote", (value) => {
          state.choices[index].fields[field.key] = value;
        }, "Server")
      );
      fieldHead.append(label, choices);
      fieldBox.append(fieldHead);

      if (field.changedCells !== undefined) {
        const meta = document.createElement("p");
        meta.className = "conflict-field-meta";
        meta.textContent = `${field.changedCells} cell${field.changedCells === 1 ? "" : "s"} differ.`;
        fieldBox.append(meta);
        if (field.cellDiffs?.length) {
          const list = document.createElement("div");
          list.className = "conflict-cell-diffs";
          for (const item of field.cellDiffs.slice(0, 30)) {
            const line = document.createElement("div");
            line.className = "conflict-cell-diff";
            line.textContent = `R${item.row} C${item.column}: server ${item.remote} → mine ${item.local}`;
            list.append(line);
          }
          if (field.cellDiffs.length > 30) {
            const more = document.createElement("div");
            more.className = "conflict-cell-diff conflict-cell-more";
            more.textContent = `…and ${field.cellDiffs.length - 30} more changed cells.`;
            list.append(more);
          }
          fieldBox.append(list);
        }
      }

      const diff = document.createElement("div");
      diff.className = "conflict-diff";
      diff.append(
        conflictValueBlock("server", "Server", field.remote, state.collection, field.key),
        conflictValueBlock("local", "Mine", field.local, state.collection, field.key)
      );
      fieldBox.append(diff);
      card.append(fieldBox);
    }

    useServer.addEventListener("click", () => {
      for (const field of record.fields) {
        state.choices[index].fields[field.key] = "remote";
        const input = card.querySelector(`input[name="conflict-${index}-${field.key}"][value="remote"]`);
        if (input) input.checked = true;
        const localInput = card.querySelector(`input[name="conflict-${index}-${field.key}"][value="local"]`);
        if (localInput) localInput.checked = false;
      }
    });
    useMine.addEventListener("click", () => {
      for (const field of record.fields) {
        state.choices[index].fields[field.key] = "local";
        const input = card.querySelector(`input[name="conflict-${index}-${field.key}"][value="local"]`);
        if (input) input.checked = true;
        const remoteInput = card.querySelector(`input[name="conflict-${index}-${field.key}"][value="remote"]`);
        if (remoteInput) remoteInput.checked = false;
      }
    });

    body.append(card);
  });

  setConflictBusy(false);
  setConflictError("");
}

function conflictApplyField(name, target, local, remote, fieldKey, choice) {
  const source = choice === "local" ? local : remote;
  if (name === "maps" && fieldKey === "geometry") {
    target.cols = source.cols;
    target.rows = source.rows;
    target.cells = conflictClone(source.cells);
    return;
  }
  target[fieldKey] = conflictClone(source?.[fieldKey]);
}

function conflictMerge(mode) {
  const state = conflictState;
  if (!state) return [];
  const merged = new Map();
  for (const item of state.remoteItems) {
    merged.set(conflictKey(state.collection, item), conflictClone(item));
  }
  state.records.forEach((record, index) => {
    if (record.kind === "added") {
      const keep = mode === "mine" ? true : mode === "server" ? false : state.choices[index].keep;
      if (keep) merged.set(record.key, conflictClone(record.local));
      return;
    }
    if (record.kind === "deleted") {
      const keepServer = mode === "server" ? true : mode === "mine" ? false : state.choices[index].keepServer;
      if (!keepServer) merged.delete(record.key);
      return;
    }
    const target = merged.get(record.key) || conflictClone(record.remote);
    for (const field of record.fields) {
      const choice = mode === "mine"
        ? "local"
        : mode === "server"
          ? "remote"
          : state.choices[index].fields[field.key] || "local";
      conflictApplyField(state.collection, target, record.local, record.remote, field.key, choice);
    }
    merged.set(record.key, target);
  });
  return [...merged.values()];
}
function conflictClearDirty(collection) {
  if (collection === "maps") {
    mapDirty = false;
    mapSnapshot = currentMap() ? conflictClone(currentMap()) : null;
    updateMapSaveButton();
  } else if (collection === "problems") {
    problemDirty = false;
    if (problemDraft && !problemDraft.isNew) {
      const current = findProblem(problemDraft.index, problemDraft.type);
      problemDraft = current ? { ...conflictClone(current), isNew: false } : null;
    }
    updateProblemSaveButton();
  }
}

function refreshAfterConflict(collection) {
  if (collection === "maps") {
    if (editorView && !editorView.hidden) {
      const map = currentMap();
      if (!map) {
        if (typeof showMaps === "function") showMaps();
        return;
      }
      mapSnapshot = conflictClone(map);
      mapDirty = false;
      updateMapSaveButton();
      renderEditor();
    } else if (mapsView && !mapsView.hidden) {
      renderMaps();
    }
    return;
  }
  if (collection === "problems") {
    if (problemEditorView && !problemEditorView.hidden) {
      const current = findProblem(editingProblemNo, editingProblemType);
      if (!current) {
        problemDraft = null;
        problemDirty = false;
        if (typeof showProblems === "function") showProblems();
        return;
      }
      problemDraft = { ...conflictClone(current), isNew: false };
      problemDirty = false;
      renderProblemEditor();
      updateProblemSaveButton();
    } else if (problemsView && !problemsView.hidden) {
      renderProblems();
    }
    return;
  }
  if (typeof refreshOpenContest === "function" && contestView && !contestView.hidden) {
    refreshOpenContest();
  } else if (competitionsView && !competitionsView.hidden) {
    renderCompetitions();
  }
}

async function persistConflictCollection(collection) {
  if (collection === "maps") return persistMapsNow();
  if (collection === "problems") return persistProblemsNow();
  return persistContestsNow();
}

async function applyConflict(mode) {
  const state = conflictState;
  if (!state || state.loading) return;
  const merged = mode === "server" ? conflictClone(state.remoteItems) : conflictMerge(mode);
  if (state.collection === "contests" && typeof contestSchedule === "function" && !merged.every(contestSchedule)) {
    setConflictError("That combination makes an invalid schedule. Choose another combination.");
    return;
  }

  const collection = state.collection;
  conflictSetCollection(collection, merged);
  revisions[collection] = state.remoteRevision;
  setConflictBusy(true);

  if (mode === "server") {
    closeConflictModal();
    conflictClearDirty(collection);
    refreshAfterConflict(collection);
    showPageToast("Using the server version.", "ok");
    return;
  }

  closeConflictModal();
  conflictClearDirty(collection);
  refreshAfterConflict(collection);
  const saved = await persistConflictCollection(collection);
  if (saved) {
    showPageToast("Conflict resolved and saved.", "ok");
  } else if (collection === "maps") {
    mapDirty = true;
    updateMapSaveButton();
  } else if (collection === "problems") {
    problemDirty = true;
    updateProblemSaveButton();
  }
}

function closeConflictModal() {
  const modal = document.querySelector("#conflict-modal");
  if (modal) modal.hidden = true;
  saveConflictActive = false;
  conflictState = null;
  setConflictError("");
}

async function openSaveConflict(collection) {
  if (saveConflictActive || !isAdmin()) return;
  saveConflictActive = true;
  conflictState = { collection, loading: true, records: [], localItems: [], remoteItems: [], choices: [] };
  showConflictLoading(collection);
  try {
    const data = await apiCall("bootstrap");
    if (!conflictState || !saveConflictActive) return;
    const remoteItems = conflictClone(data?.[collection] || []);
    const remoteRevision = data?.revisions?.[collection];
    if (!Number.isInteger(remoteRevision)) throw new Error("The server did not return a revision for this collection.");
    const localItems = conflictClone(conflictCollection(collection));
    const records = conflictBuildRecords(collection, localItems, remoteItems);
    const focus = conflictFocusKeys(collection);
    const visible = focus ? records.filter((record) => focus.has(record.key)) : records;
    conflictState = {
      collection,
      loading: false,
      focused: Boolean(focus),
      localItems,
      remoteItems,
      remoteRevision,
      records: visible,
      choices: visible.map(conflictNewChoice),
    };
    renderConflictRecords();
  } catch (error) {
    console.error("[conflict]", error);
    const body = document.querySelector("#conflict-body");
    if (body) {
      body.replaceChildren();
      const p = document.createElement("p");
      p.className = "conflict-loading";
      p.textContent = `Could not load the latest server data: ${error.message}`;
      body.append(p);
    }
    setConflictError(error.message);
    setConflictBusy(false);
  }
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
  if (isContestant()) { showStudentSettings(); return; }
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

function answerOpenModeKey() {
  const username = session?.user?.username;
  return username ? `${ANSWER_OPEN_MODE_KEY}:${username}` : ANSWER_OPEN_MODE_KEY;
}

function readAnswerOpenMode() {
  try {
    return localStorage.getItem(answerOpenModeKey()) === "newtab" ? "newtab" : "current";
  } catch {
    return "current";
  }
}

function writeAnswerOpenMode(mode) {
  try {
    localStorage.setItem(answerOpenModeKey(), mode);
  } catch {
    // The setting still applies for this visit.
  }
}

function renderStudentSettings() {
  if (answerOpenModeChoices) {
    for (const button of answerOpenModeChoices.querySelectorAll("[data-answer-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.answerMode === answerOpenMode));
    }
  }
  if (answerOpenModeNote) {
    answerOpenModeNote.textContent = answerOpenMode === "newtab"
      ? "When you click a problem, it opens in a new tab. The board stays on this tab."
      : "When you click a problem, it opens over the board in this page. Only the Close button closes it.";
  }
}

function onAnswerModeClick(event) {
  const button = event.target.closest("[data-answer-mode]");
  if (!button) return;
  const next = button.dataset.answerMode;
  if (next !== "current" && next !== "newtab") return;
  answerOpenMode = next;
  writeAnswerOpenMode(next);
  renderStudentSettings();
}

function showStudentSettings() {
  if (!requireSession()) return;
  if (!studentSettingsView) {
    location.replace("/index.html#/settings");
    return;
  }
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  studentSettingsView.hidden = false;
  setCurrentSection(settingsButton);
  renderStudentSettings();
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
    showAccountStatus(`Student ${username} created.`);
    await loadAccounts();
  } catch (error) {
    accountFormError.hidden = false;
    accountFormError.textContent = error.message;
  }
}

function showAccountStatus(message) {
  if (!accountStatus) return;
  clearTimeout(accountStatusTimer);
  accountStatus.hidden = !message;
  accountStatus.textContent = message || "";
  if (message) {
    accountStatusTimer = setTimeout(() => {
      accountStatus.hidden = true;
    }, 4500);
  }
}

function formatAccountDate(ms, empty = "Unknown") {
  if (!Number.isFinite(ms)) return empty;
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return empty;
  }
}

function accountFilterCounts() {
  return {
    all: accounts.length,
    admin: accounts.filter((account) => account.role === "admin").length,
    student: accounts.filter((account) => account.role === "student").length,
    suspended: accounts.filter((account) => account.banned).length,
  };
}

function accountMatchesFilters(account) {
  const query = accountQuery.toLowerCase();
  if (query) {
    const haystack = `${account.username} ${account.displayName} ${(account.teams || []).map((team) => `${team.teamName} ${team.contestName}`).join(" ")}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (accountFilter === "admin") return account.role === "admin";
  if (accountFilter === "student") return account.role === "student";
  if (accountFilter === "suspended") return account.banned === true;
  return true;
}

function renderAccountSummary() {
  if (!accountSummary) return;
  const counts = accountFilterCounts();
  const stats = [
    ["Accounts", counts.all],
    ["Students", counts.student],
    ["Admins", counts.admin],
    ["Suspended", counts.suspended],
  ];
  accountSummary.replaceChildren();
  for (const [label, value] of stats) {
    const stat = document.createElement("div");
    stat.className = "account-stat";
    const number = document.createElement("strong");
    number.textContent = String(value);
    const caption = document.createElement("span");
    caption.textContent = label;
    stat.append(number, caption);
    accountSummary.append(stat);
  }
}

function createAccountBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `account-badge ${className}`;
  badge.textContent = text;
  return badge;
}

function createAccountCard(account) {
  const item = document.createElement("li");
  item.className = account.banned ? "account-card suspended" : "account-card";
  item.dataset.username = account.username;

  const head = document.createElement("div");
  head.className = "account-card-head";
  const name = document.createElement("span");
  name.className = "account-card-name";
  name.textContent = account.username;
  head.append(name);
  head.append(createAccountBadge(account.role === "admin" ? "Admin" : "Student", account.role === "admin" ? "role-admin" : "role-student"));
  if (account.banned) head.append(createAccountBadge("Suspended", "status-banned"));

  const meta = document.createElement("p");
  meta.className = "account-card-meta";
  const displayName = account.displayName && account.displayName !== account.username
    ? `Display name: ${account.displayName}`
    : "No separate display name";
  meta.textContent = `${displayName} · Last login: ${formatAccountDate(account.lastLoginAt, "Never")} · Added: ${formatAccountDate(account.createdAt)}`;

  const teams = document.createElement("p");
  teams.className = "account-card-teams";
  const memberships = Array.isArray(account.teams) ? account.teams : [];
  if (memberships.length === 0) {
    teams.textContent = "Not on a contest team.";
  } else {
    teams.append("Teams: ");
    memberships.forEach((team, index) => {
      if (index > 0) teams.append(" · ");
      const chip = document.createElement("span");
      chip.className = "team-chip";
      chip.textContent = `${team.teamName} — ${team.contestName}`;
      teams.append(chip);
    });
  }

  item.append(head, meta, teams);

  if (account.role === "admin") {
    const note = document.createElement("p");
    note.className = "account-protected";
    note.textContent = "Administrator account — protected from edits, suspension, and deletion here.";
    item.append(note);
    return item;
  }

  const fields = document.createElement("div");
  fields.className = "account-fields";

  const displayField = document.createElement("label");
  displayField.className = "account-field";
  displayField.append("Display name");
  const displayInput = document.createElement("input");
  displayInput.type = "text";
  displayInput.maxLength = 60;
  displayInput.value = account.displayName;
  displayInput.dataset.accountDisplay = account.username;
  displayInput.setAttribute("aria-label", `Display name for ${account.username}`);
  displayField.append(displayInput);
  const displaySave = document.createElement("button");
  displaySave.type = "button";
  displaySave.className = "account-action";
  displaySave.dataset.accountSaveDisplay = account.username;
  displaySave.textContent = "Save name";

  const passwordField = document.createElement("label");
  passwordField.className = "account-field";
  passwordField.append("New password");
  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.maxLength = 256;
  passwordInput.placeholder = "At least 4 characters";
  passwordInput.autocomplete = "new-password";
  passwordInput.dataset.accountPasswordInput = account.username;
  passwordInput.setAttribute("aria-label", `New password for ${account.username}`);
  passwordField.append(passwordInput);
  const passwordSave = document.createElement("button");
  passwordSave.type = "button";
  passwordSave.className = "account-action";
  passwordSave.dataset.accountPassword = account.username;
  passwordSave.textContent = "Set password";

  fields.append(displayField, displaySave, passwordField, passwordSave);

  const actions = document.createElement("div");
  actions.className = "account-actions";
  const suspend = document.createElement("button");
  suspend.type = "button";
  suspend.className = "account-action";
  suspend.dataset.accountSuspend = account.username;
  suspend.dataset.banned = String(account.banned);
  suspend.textContent = account.banned ? "Restore account" : "Suspend account";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "account-action danger";
  remove.dataset.accountDelete = account.username;
  remove.textContent = "Delete account";
  remove.setAttribute("aria-label", `Delete ${account.username}`);
  actions.append(suspend, remove);

  item.append(fields, actions);
  return item;
}

function renderAccounts() {
  if (!accountList) return;
  const visible = accounts.filter(accountMatchesFilters);
  renderAccountSummary();
  if (accountFilters) {
    for (const button of accountFilters.querySelectorAll("[data-account-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.accountFilter === accountFilter));
    }
  }
  accountList.replaceChildren();
  accountEmpty.hidden = visible.length > 0;
  accountList.hidden = visible.length === 0;
  accountEmpty.textContent = accounts.length === 0
    ? "No accounts yet. Add the first student above."
    : "No accounts match this search and filter.";
  for (const account of visible) accountList.append(createAccountCard(account));
}

function onAccountFilterClick(event) {
  const button = event.target.closest("[data-account-filter]");
  if (!button) return;
  const next = button.dataset.accountFilter;
  if (!["all", "student", "admin", "suspended"].includes(next)) return;
  accountFilter = next;
  renderAccounts();
}

async function onAccountListClick(event) {
  const displayButton = event.target.closest("[data-account-save-display]");
  if (displayButton) {
    const card = displayButton.closest(".account-card");
    const field = card?.querySelector("[data-account-display]");
    await updateAccount(displayButton.dataset.accountSaveDisplay, { displayName: field?.value ?? "" }, "Display name saved.");
    return;
  }
  const passwordButton = event.target.closest("[data-account-password]");
  if (passwordButton) {
    const card = passwordButton.closest(".account-card");
    const field = card?.querySelector("[data-account-password-input]");
    if (!field || field.value.length < 4) {
      accountListError.hidden = false;
      accountListError.textContent = "Password must be at least 4 characters.";
      return;
    }
    await updateAccount(passwordButton.dataset.accountPassword, { password: field.value }, "Password changed.");
    return;
  }
  const suspendButton = event.target.closest("[data-account-suspend]");
  if (suspendButton) {
    const username = suspendButton.dataset.accountSuspend;
    const nextBanned = suspendButton.dataset.banned !== "true";
    if (nextBanned && !window.confirm(
      `Suspend ${username}?\n\nThey will be signed out on the next request, removed from any contest team, and cannot log in until restored.`
    )) return;
    await updateAccount(
      username,
      { banned: nextBanned },
      nextBanned ? `${username} is suspended.` : `${username} can sign in again.`
    );
    return;
  }
  const deleteButton = event.target.closest("[data-account-delete]");
  if (!deleteButton) return;
  const username = deleteButton.dataset.accountDelete;
  if (!confirmTwice(
    `Delete the student account ${username}?`,
    `Delete ${username} now? This removes them from contest teams and they will no longer be able to sign in.`
  )) return;
  accountListError.hidden = true;
  try {
    const data = await apiCall("delete-account", { username });
    noteRevision("contests", data);
    showAccountStatus(`${username} was deleted.`);
    await loadAccounts();
  } catch (error) {
    accountListError.hidden = false;
    accountListError.textContent = error.message;
  }
}

async function updateAccount(username, change, successMessage = "Account updated.") {
  if (typeof change.password === "string" && change.password.length < 4) {
    accountListError.hidden = false;
    accountListError.textContent = "Password must be at least 4 characters.";
    return;
  }
  accountListError.hidden = true;
  try {
    const data = await apiCall("update-account", { username, ...change });
    noteRevision("contests", data);
    showAccountStatus(successMessage);
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
    if (problemNoInput) problemNoInput.value = nextProblemLabel(placeType);
  }
  if (problemNoError) problemNoError.hidden = true;
  renderEditor();
  const map = currentMap();
  if (map && (!mapSnapshot || mapSnapshot.id !== map.id)) {
    mapSnapshot = structuredClone(map);
    mapDirty = false;
  }
  updateMapSaveButton();
}

function hideViews() {
  for (const view of [homeView, mapsView, problemsView, problemEditorView, problemBatchView, competitionsView, contestView, studentView, studentPlayView, studentSettingsView, editorView, settingsView, tutorialView, creditsView]) {
    if (view) view.hidden = true;
  }
}

function showPageToast(message, tone = "warn") {
  if (!pageToast || !pageToastMessage) return;
  clearTimeout(pageToastTimer);
  pageToast.dataset.tone = tone;
  pageToastMessage.textContent = message;
  pageToast.hidden = false;
  pageToastTimer = setTimeout(() => { pageToast.hidden = true; }, 6500);
}

function hidePageToast() {
  clearTimeout(pageToastTimer);
  if (pageToast) pageToast.hidden = true;
}
function setMenuOpen(open) {
  const wasOpen = document.body.classList.contains("menu-open");
  document.body.classList.toggle("menu-open", open);
  if (menuButton) {
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (wasOpen && !open) menuButton.focus();
  }
  if (sidebarBackdrop) sidebarBackdrop.hidden = !open;
}

function setCurrentSection(button) {
  for (const item of [mapsButton, problemsButton, competitionsButton, tutorialButton, creditsButton, settingsButton]) {
    item?.removeAttribute("aria-current");
  }
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
  if (ROUTED) navigateTo("maps", { replace: true });
  else showMaps();
}

function mapMode(map) {
  return map?.mode === "testing" ? "testing" : "official";
}

function onCreateMapModeClick(event) {
  const button = event.target.closest("[data-map-mode]");
  if (!button) return;
  newMapMode = button.dataset.mapMode === "testing" ? "testing" : "official";
  renderMapModeButtons(createMapMode, newMapMode);
  renderMaps();
}

function onMapModeClick(event) {
  const button = event.target.closest("[data-map-mode]");
  const map = currentMap();
  if (!button || !map) return;
  const mode = button.dataset.mapMode === "testing" ? "testing" : "official";
  if (mapMode(map) === mode) return;
  if (mode === "official" && (map.cells || []).some((cell) => cell?.kind === "problem" && cell.type === "testing")) {
    showPageToast("Remove Testing problems before making this map official.", "warn");
    return;
  }
  map.mode = mode;
  renderMapModeButtons(mapModeChoices, mode);
  markMapDirty();
  renderMaps();
  syncTestingPlaceTools();
}

function renderMapModeButtons(container, mode) {
  if (!container) return;
  for (const button of container.querySelectorAll("[data-map-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mapMode === mode));
  }
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
    mode: newMapMode,
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
  if (!openButton) return;
  const mapId = openButton.dataset.openId;
  if (!maps.some((map) => map.id === mapId)) return;
  try {
    showEditor(mapId);
    setHashSilently(["maps", mapId]);
  } catch (error) {
    console.error("[map]", error);
    showPageToast(error?.message || "Could not open this map.", "warn");
  }
}
// ═══════════════════════════════════════════════════════════════════
// Painting
// ═══════════════════════════════════════════════════════════════════

function chooseTool(kind) {
  paintKind = kind;
  kindProblem?.setAttribute("aria-pressed", String(kind === "problem"));
  kindSpawnpoint?.setAttribute("aria-pressed", String(kind === "spawnpoint"));
  kindObstacle?.setAttribute("aria-pressed", String(kind === "obstacle"));
  kindEmpty?.setAttribute("aria-pressed", String(kind === "empty"));
  if (problemOptions) problemOptions.hidden = kind !== "problem";
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
  window?.addEventListener("pointermove", continuePaint);
  window?.addEventListener("pointerup", stopPaint);
  window?.addEventListener("pointercancel", stopPaint);
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
  window?.addEventListener("pointermove", moveTouchPaint);
  window?.addEventListener("pointerup", finishTouchPaint);
  window?.addEventListener("pointercancel", cancelTouchPaint);
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
  if (openNo && openMapId) {
    const type = openNo.type;
    const index = String(openNo.index);
    const mapId = openMapId;
    const openProblem = () => navigateTo(["maps", mapId, "problem", type, index]);
    if (mapDirty) {
      saveOpenMap().then(() => {
        if (!mapDirty) openProblem();
      });
    } else {
      openProblem();
    }
  }
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
    const picked = placeMode === "pick" ? pickProblemForMap(map) : null;
    const problemNo = placeMode === "pick" ? picked?.index : readProblemNo(problemNoInput.value);
    const type = placeMode === "pick" ? picked?.type : placeType;
    if (type === "testing" && mapMode(map) !== "testing") {
      problemNoError.hidden = false;
      problemNoError.textContent = "Testing problems can only be placed on a testing map.";
      stopPaint();
      return;
    }
    if (placeMode === "pick" && picked?.error) {
      problemNoError.hidden = false;
      problemNoError.textContent = picked.error;
      stopPaint();
      return;
    }
    if (problemNo === null || !type) {
      problemNoError.hidden = false;
      problemNoError.textContent = `Problem no. must be a whole number from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.`;
      stopPaint();
      return;
    }

    problemNoError.hidden = true;
    paintedThisStroke.add(index);
    strokeCount += 1;
    map.cells[index] = { kind: "problem", problemNo, type };
    paintCell(map, index);
    markMapDirty();
    if (placeMode !== "pick" && nextNumberInput.checked && problemNo < MAX_PROBLEM_NO) {
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
  renderMapCounts(map);
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

function mapKindCounts(map) {
  const counts = { problem: 0, obstacle: 0, spawnpoint: 0, empty: 0, math: 0, oi: 0, science: 0, puzzle: 0, testing: 0 };
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
    ...(mapMode(map) === "testing" ? [["testing", "Testing", counts.testing]] : []),
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
  const mode = newMapMode === "testing" ? "testing" : "official";
  const group = maps.filter((map) => mapMode(map) === mode);
  mapList.replaceChildren();
  const none = group.length === 0;
  if (emptyMessage) {
    emptyMessage.hidden = !none;
    emptyMessage.textContent = maps.length === 0
      ? "No maps yet."
      : mode === "testing" ? "No testing maps yet." : "No official maps yet.";
  }
  mapList.hidden = none;
  for (const map of group) mapList.append(mapListItem(map));
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
  size.textContent = `${map.cols} × ${map.rows}`;
  label.append(name, size);
  openButton.append(createPreview(map), label);
  item.append(openButton);
  return item;
}

function renderEditor() {
  const map = currentMap();
  if (!map || !editorGrid || !editorTitle) return;
  const cells = Array.isArray(map.cells) ? map.cells : [];

  editorTitle.textContent = map.name;
  if (editorSize) editorSize.textContent = `${map.cols} × ${map.rows}`;
  renderMapCounts(map);
  if (editorNameInput) editorNameInput.value = map.name;
  renderMapModeButtons(mapModeChoices, mapMode(map));
  if (editorView) editorView.dataset.mapMode = mapMode(map);
  syncTestingPlaceTools();
  if (deleteOpenMapButton) deleteOpenMapButton.setAttribute("aria-label", `Delete map ${map.name}`);
  editorGrid.dataset.cols = String(map.cols);
  editorGrid.dataset.rows = String(map.rows);
  layoutMapGrid(editorGrid, map.cols, map.rows);
  editorGrid.replaceChildren();

  cells.forEach((cell, index) => {
    if (!cell) return;
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

  for (const cell of map.cells || []) {
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
    for (const cell of map.cells || []) {
      if (cell?.kind === "problem" && cell.type === type) used.add(cell.problemNo);
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
// ═══════════════════════════════════════════════════════════════════
// Problems
// ═══════════════════════════════════════════════════════════════════

function onProblemSectionClick(event) {
  const button = event.target.closest("[data-section]");
  if (!button || !typeInfo(button.dataset.section)) return;
  activeProblemType = button.dataset.section;
  problemPage = 1;
  problemQuery = "";
  problemDifficultyFilter = "all";
  problemSortMode = "index";
  problemSelectMode = false;
  selectedProblemKeys.clear();
  if (problemSearch) problemSearch.value = "";
  if (ROUTED) navigateTo(["problems", button.dataset.section]);
  else {
    activeProblemType = button.dataset.section;
    setHashSilently(["problems", button.dataset.section]);
    renderProblems();
  }
}

function syncProblemToolbar() {
  if (problemSearch && problemSearch.value !== problemQuery && document.activeElement !== problemSearch) {
    problemSearch.value = problemQuery;
  }
  if (problemSort) problemSort.value = problemSortMode;
  if (problemDifficultyFilterButtons) {
    for (const button of problemDifficultyFilterButtons.querySelectorAll("[data-problem-difficulty-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.problemDifficultyFilter === problemDifficultyFilter));
    }
  }
  if (problemSelectAllLabel) {
    const filtering = Boolean(problemQuery) || problemDifficultyFilter !== "all";
    problemSelectAllLabel.textContent = filtering ? "All results" : "All";
  }
}

const _applyProblemSearch = debounce(() => {
  problemQuery = problemSearch?.value.trim() || "";
  problemPage = 1;
  selectedProblemKeys.clear();
  renderProblems();
}, 150);

function onProblemSearchInput() {
  _applyProblemSearch();
}

function onProblemDifficultyFilterClick(event) {
  const button = event.target.closest("[data-problem-difficulty-filter]");
  if (!button) return;
  const next = button.dataset.problemDifficultyFilter;
  if (next !== "all" && !DIFFICULTIES.includes(next)) return;
  problemDifficultyFilter = next;
  problemPage = 1;
  selectedProblemKeys.clear();
  renderProblems();
}

function onProblemSortChange() {
  const next = problemSort?.value;
  if (!["index", "index-desc", "difficulty"].includes(next)) return;
  problemSortMode = next;
  problemPage = 1;
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
  const index = nextProblemNo(problemType);
  if (index === null) {
    showPageToast(`Every index from ${YEAR_INDEX_START} to ${YEAR_INDEX_END} is already used for ${typeInfo(problemType).name}.`, "warn");
    return;
  }
  navigateTo(["problems", problemType, String(index)]);
}

function deleteOpenProblem() {
  if (problemDraft?.isNew && !findProblem(problemDraft.index, problemDraft.type)) {
    const type = problemDraft.type;
    problemDraft = null;
    problemDirty = false;
    if (problemReturn === "map" && openMapId) navigateTo(["maps", openMapId], { replace: true });
    else navigateTo(["problems", type], { replace: true });
    return;
  }
  deleteProblem(editingProblemNo, editingProblemType);
}

function onProblemListClick(event) {
  if (event.target.closest("#add-problem")) {
    if (activeProblemType) addProblem(activeProblemType);
    return;
  }

  const pageButton = event.target.closest("[data-problem-page]");
  if (pageButton) {
    if (pageButton.disabled) return;
    const next = Number(pageButton.dataset.problemPage);
    if (!Number.isInteger(next)) return;
    problemPage = next;
    renderProblems();
    return;
  }

  const duplicateButton = event.target.closest("[data-duplicate-problem]");
  if (duplicateButton) {
    duplicateProblem(Number(duplicateButton.dataset.duplicateProblem), duplicateButton.dataset.duplicateType);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-problem]");
  if (deleteButton) {
    deleteProblem(Number(deleteButton.dataset.deleteProblem), deleteButton.dataset.deleteType);
    return;
  }

  if (problemSelectMode) {
    const row = event.target.closest(".problem-row");
    if (row && !event.target.closest(".problem-check")) {
      const box = row.querySelector("[data-select-problem]");
      if (box) {
        box.checked = !box.checked;
        onProblemSelectionChange({ target: box });
      }
      return;
    }
  }

  const openButton = event.target.closest("[data-open-problem]");
  if (!openButton) return;
  navigateTo(["problems", openButton.dataset.openType, openButton.dataset.openProblem]);
}

function duplicateProblem(index, type) {
  const source = findProblem(index, type);
  if (!source) return;
  const copyType = typeInfo(type) ? type : "math";
  const nextIndex = nextProblemNo(copyType);
  if (nextIndex === null) {
    showPageToast(`Every index from ${YEAR_INDEX_START} to ${YEAR_INDEX_END} is already used for ${typeInfo(copyType).name}.`, "warn");
    return;
  }
  const copy = {
    index: nextIndex,
    type: copyType,
    prompt: source.prompt,
    answer: source.answer,
    logic: source.logic || "",
    difficulty: problemDifficulty(source),
  };
  problems.push(copy);
  problems.sort(compareProblems);
  persistProblems();
  navigateTo(["problems", copyType, String(nextIndex)]);
}

function duplicateCurrentProblem() {
  if (!problemDraft) return;
  if (problemDraft.isNew || problemDirty) {
    saveOpenProblem();
    if (!problemDraft || problemDraft.isNew || problemDirty) return;
  }
  const type = problemDraft.type;
  const nextIndex = nextProblemNo(type);
  if (nextIndex === null) {
    showPageToast(`Every index from ${YEAR_INDEX_START} to ${YEAR_INDEX_END} is already used for ${typeInfo(type).name}.`, "warn");
    return;
  }
  pendingProblemDraft = {
    index: nextIndex,
    type,
    prompt: problemPrompt.value,
    answer: problemAnswer.value,
    logic: problemLogic.value,
    difficulty: problemDraft.difficulty,
    isNew: true,
  };
  navigateTo(["problems", type, String(nextIndex)]);
}
function showProblemEditor(index, type, fromMap) {
  const problemType = typeInfo(type) ? type : "math";
  const existing = findProblem(index, problemType);
  const pending = pendingProblemDraft;
  pendingProblemDraft = null;
  if (pending && pending.index === index && pending.type === problemType) {
    problemDraft = pending;
  } else {
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
  }
  problemDirty = false;
  stopPaint();
  if (!fromMap) openMapId = null;
  openContestId = null;
  editingProblemNo = index;
  editingProblemType = problemType;
  problemReturn = fromMap ? "map" : "list";
  hideViews();
  problemEditorView.hidden = false;
  setCurrentSection(fromMap ? mapsButton : problemsButton);
  renderProblemEditor();
  updateProblemSaveButton();
  problemPrompt.focus();
}

function closeProblemEditor() {
  if (!discardUnsavedProblem()) return;
  const mapId = openMapId;
  if (problemReturn === "map" && mapId && maps.some((map) => map.id === mapId)) {
    navigateTo(["maps", mapId]);
    return;
  }
  const problem = findProblem(editingProblemNo, editingProblemType);
  const type = problem ? problem.type : editingProblemType;
  if (problem) revealProblemInList(problem.index, problem.type);
  navigateTo(["problems", typeInfo(type) ? type : "math"]);
}

function revealProblemInList(index, type) {
  if (!typeInfo(type)) return;
  activeProblemType = type;
  problemQuery = "";
  problemDifficultyFilter = "all";
  problemSortMode = "index";
  if (problemSearch) problemSearch.value = "";
  const ordered = problems
    .filter((problem) => problem.type === type)
    .sort(compareProblems);
  const position = ordered.findIndex((problem) => problem.index === index);
  problemPage = position >= 0 ? Math.floor(position / PROBLEM_PAGE_SIZE) + 1 : 1;
}

function syncProblemRoute() {
  if (!ROUTED || !problemDraft) return;
  if (problemReturn === "map" && openMapId) {
    setHashSilently(["maps", openMapId, "problem", problemDraft.type, String(problemDraft.index)]);
    return;
  }
  setHashSilently(["problems", problemDraft.type, String(problemDraft.index)]);
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
    syncProblemRoute();
    return;
  }
  if (!reindexProblem(editingProblemNo, next)) {
    problemIndexInput.value = String(editingProblemNo);
    return;
  }

  editingProblemNo = next;
  if (problemDraft) problemDraft.index = next;
  syncProblemRoute();
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
    syncProblemRoute();
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
  else {
    renderProblemEditor();
    syncProblemRoute();
  }
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
  const usage = problemUsage(index, type);
  const where = usage.cells > 0
    ? `It is placed on ${usage.maps} map${usage.maps === 1 ? "" : "s"} in ${usage.cells} cell${usage.cells === 1 ? "" : "s"}, and those cells will be cleared.`
    : "It is not placed on any map.";
  if (!window.confirm(`Delete ${tag}?\n\n${where}`)) return;
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
  if (wasOpen) {
    if (problemReturn === "map" && openMapId) navigateTo(["maps", openMapId], { replace: true });
    else navigateTo(["problems", typeInfo(type) ? type : "math"], { replace: true });
  } else {
    renderProblems();
  }
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

function problemUsage(index, type) {
  let cells = 0;
  const mapIds = new Set();
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.problemNo === index && cell.type === type) {
        cells += 1;
        mapIds.add(map.id);
      }
    }
  }
  return { cells, maps: mapIds.size };
}

function plainProblemText(source) {
  return String(source || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function problemMatchesFilters(problem) {
  if (problemDifficultyFilter !== "all" && problemDifficulty(problem) !== problemDifficultyFilter) {
    return false;
  }
  const query = problemQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    problemTag(problem.index, problem.type),
    String(problem.index),
    plainProblemText(problem.prompt),
    plainProblemText(problem.answer),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function filteredProblems() {
  const items = problemsOfActiveType().filter(problemMatchesFilters);
  if (problemSortMode === "index-desc") {
    items.sort((a, b) => b.index - a.index || a.type.localeCompare(b.type));
  } else if (problemSortMode === "difficulty") {
    items.sort((a, b) => (
      DIFFICULTY_SCORE[problemDifficulty(b)] - DIFFICULTY_SCORE[problemDifficulty(a)]
      || compareProblems(a, b)
    ));
  } else {
    items.sort(compareProblems);
  }
  return items;
}

function pageNumbers(current, total) {
  const pages = new Set([1, total]);
  for (let page = current - 2; page <= current + 2; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }
  const ordered = [...pages].sort((a, b) => a - b);
  const result = [];
  let previous = 0;
  for (const page of ordered) {
    if (previous && page - previous > 1) result.push("…");
    result.push(page);
    previous = page;
  }
  return result;
}

function renderProblemPages(pageCount) {
  problemPages.replaceChildren();
  problemPages.hidden = pageCount <= 1;
  if (pageCount <= 1) return;

  const addButton = (label, page, options = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    if (page !== null) button.dataset.problemPage = String(page);
    button.textContent = label;
    if (options.current) button.setAttribute("aria-pressed", "true");
    if (options.disabled) button.disabled = true;
    problemPages.append(button);
  };

  addButton("‹ Prev", problemPage - 1, { disabled: problemPage <= 1 });
  for (const page of pageNumbers(problemPage, pageCount)) {
    if (page === "…") {
      const gap = document.createElement("span");
      gap.className = "page-gap";
      gap.textContent = "…";
      problemPages.append(gap);
    } else {
      addButton(String(page), page, { current: page === problemPage });
    }
  }
  addButton("Next ›", problemPage + 1, { disabled: problemPage >= pageCount });
}

function syncProblemTypeCounts() {
  if (!problemSectionChoices) return;
  for (const button of problemSectionChoices.querySelectorAll("[data-section]")) {
    const type = typeInfo(button.dataset.section);
    if (!type) continue;
    const count = problems.filter((problem) => problem.type === type.id).length;
    button.dataset.count = String(count);
    button.setAttribute("aria-label", `${type.name}, ${count} problem${count === 1 ? "" : "s"}`);
  }
}

function renderProblems() {
  if (problemSearch) problemQuery = problemSearch.value.trim();
  syncProblemTypeCounts();
  for (const button of problemSectionChoices.querySelectorAll("[data-section]")) {
    button.setAttribute("aria-pressed", String(button.dataset.section === activeProblemType));
  }

  const type = typeInfo(activeProblemType);
  if (!type) {
    problemSection.hidden = true;
    return;
  }

  syncProblemToolbar();
  const all = problems.filter((problem) => problem.type === type.id);
  const matching = filteredProblems();
  const pageCount = Math.max(1, Math.ceil(matching.length / PROBLEM_PAGE_SIZE));
  problemPage = Math.min(Math.max(1, problemPage), pageCount);
  const start = (problemPage - 1) * PROBLEM_PAGE_SIZE;
  const visible = matching.slice(start, start + PROBLEM_PAGE_SIZE);
  const filtering = Boolean(problemQuery.trim()) || problemDifficultyFilter !== "all";

  problemSection.hidden = false;
  problemSectionTitle.textContent = type.name;
  const tag = document.createElement("span");
  tag.className = "problem-tag";
  tag.textContent = type.tag;
  problemSectionTitle.append(tag);
  addProblemButton.setAttribute("aria-label", `Add ${type.name} problem`);
  renderProblemPages(pageCount);

  if (problemCount) {
    if (matching.length === 0) {
      problemCount.textContent = filtering ? `No matches in ${all.length} problem${all.length === 1 ? "" : "s"}` : "No problems yet";
    } else {
      const end = Math.min(start + visible.length, matching.length);
      problemCount.textContent = filtering
        ? `Showing ${start + 1}–${end} of ${matching.length} matches (${all.length} total)`
        : `Showing ${start + 1}–${end} of ${matching.length}`;
    }
  }

  if (all.length === 0) {
    problemSelectMode = false;
    selectedProblemKeys.clear();
  }
  problemSelectToggle.hidden = all.length === 0;
  problemSelectToggle.setAttribute("aria-pressed", String(problemSelectMode));
  problemSelectToggle.textContent = problemSelectMode ? "Done" : "Select";
  problemBulk.hidden = !problemSelectMode || all.length === 0;
  if (problemSelectAllLabel) problemSelectAllLabel.textContent = filtering ? "All results" : "All";

  problemEmpty.hidden = matching.length > 0;
  problemEmpty.textContent = all.length === 0
    ? `No ${type.name} problems yet.`
    : "No problems match this search and filter.";

  problemList.replaceChildren();
  for (const problem of visible) problemList.append(createProblemEntity(problem));
  problemList.hidden = visible.length === 0;
  pruneProblemSelection();
  syncProblemSelection(matching);
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

function syncProblemSelection(matching = filteredProblems()) {
  const boxes = [...problemList.querySelectorAll("[data-select-problem]")];
  const selectedOnPage = boxes.filter((box) => box.checked).length;
  const chosen = selectedProblems();
  problemSelectPage.checked = boxes.length > 0 && selectedOnPage === boxes.length;
  problemSelectPage.indeterminate = selectedOnPage > 0 && selectedOnPage < boxes.length;
  problemSelectAll.checked = matching.length > 0 && chosen.length === matching.length;
  problemSelectAll.indeterminate = chosen.length > 0 && chosen.length < matching.length;
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
  for (const problem of filteredProblems()) {
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
  const tags = chosen.slice(0, 8).map((problem) => problemTag(problem.index, problem.type));
  const tagText = tags.join(", ") + (chosen.length > tags.length ? ` and ${chosen.length - tags.length} more` : "");
  const pronoun = chosen.length === 1 ? "It" : "They";
  if (!window.confirm(`Delete ${chosen.length} problem${chosen.length === 1 ? "" : "s"}? ${tagText}.\n\n${pronoun} will also be cleared from every map.`)) return;
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

function createProblemEntity(problem) {
  const item = document.createElement("li");
  const check = document.createElement("label");
  const checkbox = document.createElement("input");
  const openButton = document.createElement("button");
  const key = document.createElement("span");
  const difficulty = document.createElement("span");
  const snippet = document.createElement("span");
  const usage = document.createElement("span");
  const actions = document.createElement("div");
  const tag = problemTag(problem.index, problem.type);
  const level = problemDifficulty(problem);
  const usageInfo = problemUsage(problem.index, problem.type);

  item.className = problemSelectMode ? "problem-row selecting" : "problem-row";
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
  key.className = `problem-key ${problem.type}`;
  key.textContent = tag;
  difficulty.className = `difficulty-chip ${level}`;
  difficulty.textContent = DIFFICULTY_NAME[level];
  snippet.className = "problem-snippet";
  snippet.textContent = problemSnippet(problem);
  renderMath(snippet);
  openButton.append(key, difficulty, snippet);

  usage.className = usageInfo.cells > 0 ? "problem-usage-chip" : "problem-usage-chip unused";
  usage.textContent = usageInfo.cells > 0
    ? `${usageInfo.maps} map${usageInfo.maps === 1 ? "" : "s"} · ${usageInfo.cells} cell${usageInfo.cells === 1 ? "" : "s"}`
    : "Not placed";
  usage.setAttribute("aria-label", usageInfo.cells > 0
    ? `Used on ${usageInfo.maps} map${usageInfo.maps === 1 ? "" : "s"} in ${usageInfo.cells} cell${usageInfo.cells === 1 ? "" : "s"}`
    : "Not placed on any map");

  if (problemSelectMode) {
    const main = document.createElement("div");
    main.className = "problem-row-main";
    main.append(check, openButton);
    item.append(main, usage);
  } else {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "account-action";
    editButton.dataset.openProblem = String(problem.index);
    editButton.dataset.openType = problem.type;
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${tag}`);

    const duplicateButton = document.createElement("button");
    duplicateButton.type = "button";
    duplicateButton.className = "account-action";
    duplicateButton.dataset.duplicateProblem = String(problem.index);
    duplicateButton.dataset.duplicateType = problem.type;
    duplicateButton.textContent = "Duplicate";
    duplicateButton.setAttribute("aria-label", `Duplicate ${tag}`);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "account-action danger";
    deleteButton.dataset.deleteProblem = String(problem.index);
    deleteButton.dataset.deleteType = problem.type;
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${tag}`);

    actions.className = "problem-row-actions";
    actions.append(editButton, duplicateButton, deleteButton);
    const main = document.createElement("div");
    main.className = "problem-row-main";
    main.append(openButton, actions);
    item.append(main, usage);
  }
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
  const text = element.textContent || "";
  if (!text.includes("$") && !text.includes("\\")) return;
  try {
    renderMathInElement(element, {
      delimiters: MATH_DELIMITERS,
      throwOnError: false,
      strict: "ignore",
    });
  } catch (error) {
    console.error("[math]", error);
  }
}

function containsHtml(source) {
  return /<\/?[a-z][\w:-]*\b[^>]*>/i.test(source);
}


const STATEMENT_KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css";
const STATEMENT_KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js";
const STATEMENT_AUTO_RENDER_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js";
const statementFrames = new WeakMap();

function escapeStatementText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let activeStudentStatementFrame = null;
let pendingStatementSubmit = null;

function buildStatementDocument(source, tag = "") {
  const text = String(source || "");
  const tagText = escapeStatementText(tag);
  const body = containsHtml(text)
    ? text
    : `<pre class="statement-text">${escapeStatementText(text)}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${STATEMENT_KATEX_CSS}" crossorigin="anonymous">
<style>
  html, body { margin: 0; padding: 0; background: #081220; color: #d7f6ff; }
  body { font-family: "Share Tech Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 16px; line-height: 1.55; }
  #territory-bridge { display: none; }
  .statement-content { overflow-wrap: anywhere; font-size: 16px; }
  .katex { font-size: 1em; }
  .statement-content pre { margin: 0; white-space: pre-wrap; overflow: auto; }
  .statement-content img, .statement-content video,
  .statement-content canvas, .statement-content svg { max-width: 100%; height: auto; }
  .statement-content table { max-width: 100%; border-collapse: collapse; }
  .statement-content a { color: #3ee0ff; }
</style>
<script src="${STATEMENT_KATEX_JS}" crossorigin="anonymous"></script>
<script src="${STATEMENT_AUTO_RENDER_JS}" crossorigin="anonymous"></script>
<script>
(function () {
  function report() {
    try {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ type: "territory-statement-height", height: height }, "*");
    } catch (error) {}
  }
  function renderMath() {
    if (typeof renderMathInElement !== "function") return;
    try {
      renderMathInElement(document.querySelector(".statement-content"), {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\\\[", right: "\\\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\\\(", right: "\\\\)", display: false }
        ],
        throwOnError: false,
        strict: "ignore"
      });
    } catch (error) {}
  }
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    renderMath();
    report();
    try {
      if (window.ResizeObserver) new ResizeObserver(report).observe(document.documentElement);
    } catch (error) {}
    try {
      new MutationObserver(report).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    } catch (error) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("load", boot);
})();
</script>
</head><body>
<div id="territory-bridge" aria-hidden="true">
  <span id="student-problem-tag">${tagText}</span>
  <form id="student-answer-form"><button type="submit">Submit</button></form>
  <input id="student-answer" type="text" />
  <p id="student-answer-error" hidden></p>
</div>
<script>
(function () {
  var input = document.getElementById("student-answer");
  var form = document.getElementById("student-answer-form");
  var err = document.getElementById("student-answer-error");
  if (!input || !form || !err) return;
  var answer = "";
  var readOnly = false;
  var errorHidden = true;
  var errorText = "";
  function post(type, data) {
    try {
      var message = { type: type };
      if (data) for (var key in data) if (Object.prototype.hasOwnProperty.call(data, key)) message[key] = data[key];
      parent.postMessage(message, "*");
    } catch (error) {}
  }
  Object.defineProperty(input, "value", {
    get: function () { return answer; },
    set: function (next) { answer = String(next == null ? "" : next); post("territory-answer-value", { value: answer }); }
  });
  var styleProxy = {};
  Object.defineProperty(styleProxy, "cssText", {
    get: function () { return input.getAttribute("style") || ""; },
    set: function (next) {
      var css = String(next == null ? "" : next);
      input.setAttribute("style", css);
      post("territory-answer-style", { cssText: css });
    }
  });
  Object.defineProperty(input, "style", { get: function () { return styleProxy; } });
  Object.defineProperty(input, "readOnly", {
    get: function () { return readOnly; },
    set: function (next) {
      readOnly = !!next;
      if (readOnly) input.setAttribute("readonly", "readonly");
      else input.removeAttribute("readonly");
      post("territory-answer-readonly", { readOnly: readOnly });
    }
  });
  function postError() { post("territory-answer-error", { hidden: errorHidden, text: errorText }); }
  Object.defineProperty(err, "hidden", {
    get: function () { return errorHidden; },
    set: function (next) { errorHidden = !!next; postError(); }
  });
  Object.defineProperty(err, "textContent", {
    get: function () { return errorText; },
    set: function (next) { errorText = String(next == null ? "" : next); postError(); }
  });
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "territory-before-submit") return;
    var blocked = false;
    var button = form.querySelector("button");
    if (button) {
      var click = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      button.dispatchEvent(click);
      blocked = click.defaultPrevented;
    }
    post("territory-submit-result", { id: data.id, blocked: blocked, message: errorHidden ? "" : errorText });
  });
})();
</script>
<div class="statement-content">${body}</div>
</body></html>`;
}

// Problem HTML runs in a sandboxed iframe. It may use its own scripts and the
// hidden answer bridge, but it cannot reach the parent page or close button.
function setRichText(element, source, options = {}) {
  const text = String(source || "");
  element.replaceChildren();
  element.classList.add("rich-html", "isolated-statement");
  const frame = document.createElement("iframe");
  frame.className = "statement-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("title", "Problem statement");
  frame.style.height = "120px";
  frame.srcdoc = buildStatementDocument(text, options.tag || "");
  element.append(frame);
  if (frame.contentWindow) statementFrames.set(frame.contentWindow, frame);
  return frame;
}

function approveStatementSubmit() {
  const frame = activeStudentStatementFrame;
  if (!frame || !frame.contentWindow) return Promise.resolve({ blocked: false, message: "" });
  if (pendingStatementSubmit) {
    clearTimeout(pendingStatementSubmit.timer);
    pendingStatementSubmit.resolve({ blocked: false, message: "" });
    pendingStatementSubmit = null;
  }
  return new Promise((resolve) => {
    const id = `statement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      if (pendingStatementSubmit && pendingStatementSubmit.id === id) {
        pendingStatementSubmit = null;
        resolve({ blocked: false, message: "" });
      }
    }, 300);
    pendingStatementSubmit = {
      id,
      timer,
      resolve: (result) => { clearTimeout(timer); resolve(result); },
    };
    try {
      frame.contentWindow.postMessage({ type: "territory-before-submit", id }, "*");
    } catch (error) {
      clearTimeout(timer);
      pendingStatementSubmit = null;
      resolve({ blocked: false, message: "" });
    }
  });
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;
  const frame = statementFrames.get(event.source);
  if (!frame) return;
  if (data.type === "territory-statement-height") {
    const height = Number(data.height);
    if (!Number.isFinite(height)) return;
    frame.style.height = `${Math.max(48, Math.min(8000, Math.ceil(height)))}px`;
    return;
  }
  if (frame !== activeStudentStatementFrame) return;
  if (data.type === "territory-answer-value" && studentAnswer) {
    studentAnswer.value = String(data.value == null ? "" : data.value);
  } else if (data.type === "territory-answer-style" && studentAnswer) {
    studentAnswer.style.cssText = String(data.cssText == null ? "" : data.cssText);
  } else if (data.type === "territory-answer-readonly" && studentAnswer) {
    studentAnswer.readOnly = data.readOnly === true;
  } else if (data.type === "territory-answer-error" && studentAnswerError) {
    studentAnswerError.hidden = data.hidden === true;
    studentAnswerError.textContent = String(data.text == null ? "" : data.text);
  } else if (data.type === "territory-submit-result" && pendingStatementSubmit && pendingStatementSubmit.id === data.id) {
    const pending = pendingStatementSubmit;
    pendingStatementSubmit = null;
    clearTimeout(pending.timer);
    pending.resolve({
      blocked: data.blocked === true,
      message: String(data.message == null ? "" : data.message),
    });
  }
});
function problemSnippet(problem) {
  const raw = (problem.prompt || "").trim();
  if (!raw) return "No text yet";
  // Strip tags for list display
  const div = document.createElement("div");
  div.innerHTML = raw;
  div.querySelectorAll("script, style").forEach((node) => node.remove());
  const text = (div.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return "(empty)";
  return text;
}

function renderProblemEditor() {
  const problem = problemDraft;
  if (!problem) {
    showProblems();
    setHashSilently(editingProblemType ? ["problems", editingProblemType] : "problems");
    return;
  }

  const tag = problemTag(problem.index, problem.type);
  problemEditorTitle.textContent = tag;
  problemBackButton.textContent = problemReturn === "map" ? "Back to map" : "Back to problems";
  deleteOpenProblemButton.setAttribute("aria-label", `Delete ${tag}`);
  if (problemUsageNote) {
    const usage = problemUsage(problem.index, problem.type);
    problemUsageNote.hidden = false;
    problemUsageNote.textContent = usage.cells > 0
      ? `This problem is placed on ${usage.maps} map${usage.maps === 1 ? "" : "s"} in ${usage.cells} cell${usage.cells === 1 ? "" : "s"}. Deleting it also clears those cells.`
      : "This problem is not placed on any map yet.";
  }
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

  updateProblemSaveButton();
  // Render HTML preview
  requestAnimationFrame(renderProblemPreview);
}
// ═══════════════════════════════════════════════════════════════════
// HTML preview and admin test submission for problem fields
// ═══════════════════════════════════════════════════════════════════

let problemTestKey = "";

function clearProblemTestResult() {
  const result = document.querySelector("#problem-test-result");
  if (!result) return;
  result.hidden = true;
  result.replaceChildren();
  delete result.dataset.result;
}

function resetProblemTest() {
  const input = document.querySelector("#problem-test-answer");
  if (input) input.value = "";
  clearProblemTestResult();
}

function ensureProblemTestBox(previewEl) {
  if (!problemEditorForm || !previewEl) return null;
  let box = problemEditorForm.querySelector("#problem-test-box");
  if (!box) {
    box = document.createElement("section");
    box.id = "problem-test-box";
    box.className = "problem-test-box";

    const title = document.createElement("h3");
    title.textContent = "Test submission";

    const note = document.createElement("p");
    note.className = "field-note";
    note.textContent = "Run the current Answer and Logic fields without saving. The test runs in the server sandbox.";

    const label = document.createElement("label");
    label.className = "problem-test-answer-field";
    label.append("Student answer");
    const input = document.createElement("textarea");
    input.id = "problem-test-answer";
    input.rows = 2;
    input.placeholder = "Type the answer a student would submit";
    label.append(input);

    const actions = document.createElement("div");
    actions.className = "problem-test-actions";
    const run = document.createElement("button");
    run.id = "problem-test-run";
    run.type = "button";
    run.textContent = "Run test";
    actions.append(run);

    const result = document.createElement("div");
    result.id = "problem-test-result";
    result.className = "problem-test-result";
    result.hidden = true;

    box.append(title, note, label, actions, result);
    previewEl.after(box);
    run.addEventListener("click", runProblemTest);
    input.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runProblemTest();
      }
    });
    input.addEventListener("input", clearProblemTestResult);
    problemAnswer?.addEventListener("input", clearProblemTestResult);
    problemLogic?.addEventListener("input", clearProblemTestResult);
  }
  return box;
}

function renderProblemTestResult(state, title, detail) {
  const result = document.querySelector("#problem-test-result");
  if (!result) return;
  result.hidden = false;
  result.dataset.result = state;
  result.replaceChildren();
  const badge = document.createElement("strong");
  badge.className = "problem-test-badge";
  badge.textContent = title;
  result.append(badge);
  if (detail) {
    const text = document.createElement("p");
    text.className = "problem-test-detail";
    text.textContent = detail;
    result.append(text);
  }
}

async function runProblemTest() {
  const button = document.querySelector("#problem-test-run");
  const input = document.querySelector("#problem-test-answer");
  if (!button || !input || !problemLogic || !problemAnswer) return;
  button.disabled = true;
  renderProblemTestResult("RUNNING", "Testing...", "Running the checker in the server sandbox.");

  try {
    const data = await apiCall("test-problem", {
      logic: problemLogic.value,
      expected: problemAnswer.value,
      answer: input.value,
    });
    if (data.systemError) {
      renderProblemTestResult(
        "ERROR",
        "Runtime error",
        data.error || data.comment || "The checker could not run."
      );
      return;
    }

    const details = [];
    const comment = typeof data.comment === "string" ? data.comment.trim() : "";
    if (comment && comment !== "AC" && comment !== "WA") details.push(comment);
    if (typeof data.score === "number") details.push(`Score: ${data.score}/100`);

    if (data.correct) {
      renderProblemTestResult("AC", "AC", details.join(" · "));
    } else {
      renderProblemTestResult("WA", "WA", details.join(" · "));
    }
  } catch (error) {
    renderProblemTestResult("ERROR", "Error", error.message);
  } finally {
    button.disabled = false;
  }
}

function renderProblemPreview() {
  if (!problemEditorForm) return;

  let previewEl = problemEditorForm.querySelector(":scope > .problem-preview");
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.className = "problem-preview";
    problemEditorForm.appendChild(previewEl);
  }
  previewEl.replaceChildren();

  const key = `${editingProblemType || ""}:${editingProblemNo ?? ""}`;
  if (problemTestKey !== key) {
    problemTestKey = key;
    resetProblemTest();
  }
  ensureProblemTestBox(previewEl);

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
  const found = (contest.teams || []).findIndex((team) => team.id === teamId);
  const slot = (found < 0 ? 0 : found) % TEAM_COLOR_LIMIT;
  const hue = (slot * 137.508 + 8) % 360;
  const saturation = 82 + (slot % 3) * 5;
  const lightness = 58 + (slot % 4) * 5;
  return `hsl(${hue.toFixed(2)} ${saturation}% ${lightness}%)`;
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
    .filter((team) => team && typeof team.id === "string" && typeof team.name === "string" && Array.isArray(team.members))
    .map((team) => {
      const members = [];
      for (const member of team.members.map((item) => String(item || "").trim()).filter(Boolean)) {
        if (members.some((item) => sameContestant(item, member))) continue;
        members.push(member);
      }
      return { id: team.id, name: team.name, members };
    })
    .filter((team) => team.members.length >= 1 && team.members.length <= 5);
}

function normalizeSpawnVotes(value) {
  if (!Array.isArray(value)) return [];
  const votes = [];
  for (const vote of value) {
    if (!vote || typeof vote.teamId !== "string" || typeof vote.username !== "string" || !Number.isInteger(vote.cell) || vote.cell < 0) continue;
    const existing = votes.findIndex((item) => item.teamId === vote.teamId && sameContestant(item.username, vote.username));
    if (existing >= 0) votes.splice(existing, 1);
    votes.push({ teamId: vote.teamId, username: vote.username, cell: vote.cell });
  }
  return votes;
}

function agreedSpawnChoices(contest) {
  const choices = [];
  for (const team of contest?.teams || []) {
    const votes = (contest.spawnVotes || []).filter((vote) => vote.teamId === team.id && team.members.some((member) => sameContestant(member, vote.username)));
    if (votes.length !== team.members.length) continue;
    const cell = votes[0].cell;
    if (votes.every((vote) => vote.cell === cell)) choices.push({ teamId: team.id, cell });
  }
  return choices;
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
  if (next.mode === "testing" || next.mode === "competition") contest.mode = next.mode;
  if (Array.isArray(next.resolvedTeams)) contest.resolvedTeams = next.resolvedTeams.filter((id) => typeof id === "string");
  if (Array.isArray(next.spawnChoices)) contest.spawnChoices = normalizeTeamCells(next.spawnChoices);
  if (Array.isArray(next.spawnVotes)) contest.spawnVotes = normalizeSpawnVotes(next.spawnVotes);
  if (Array.isArray(next.spawns)) contest.spawns = normalizeTeamCells(next.spawns);
  if (Array.isArray(next.claims)) contest.claims = normalizeClaims(next.claims);
  noteRevision("contests", data);
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
  const spawns = contest.spawnResolved ? (contest.spawns || []) : [];
  return (contest.teams || []).map((team) => {
    let score = 0;
    let solved = 0;
    let territory = spawns.some((spawn) => spawn.teamId === team.id) ? 1 : 0;
    for (const claim of contest.claims || []) {
      if (claim.teamId !== team.id) continue;
      territory += 1;
      const cell = map?.cells?.[claim.cell];
      if (!cell || cell.kind !== "problem") continue;
      score += DIFFICULTY_SCORE[cellDifficulty(cell)];
      solved += 1;
    }
    return { teamId: team.id, name: team.name, score, solved, territory };
  }).sort((a, b) => b.score - a.score || b.solved - a.solved || a.name.localeCompare(b.name));
}

function renderLeaderboard(list, empty, contest) {
  const rows = buildLeaderboard(contest);
  if (!list) return;
  list.replaceChildren();
  if (empty) {
    empty.hidden = rows.length > 0;
    list.hidden = rows.length === 0;
  }
  if (rows.length > 0) {
    const head = document.createElement("li");
    head.className = "leaderboard-row leaderboard-head";
    for (const [cls, text] of [
      ["leaderboard-rank", "Rank"],
      ["leaderboard-team", "Team"],
      ["leaderboard-stat", "Score"],
      ["leaderboard-stat", "Solved"],
      ["leaderboard-stat", "Territory"],
    ]) {
      const cell = document.createElement("span");
      cell.className = cls;
      cell.textContent = text;
      head.append(cell);
    }
    list.append(head);
  }
  rows.forEach((row, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-row";
    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = `${index + 1}.`;
    const name = document.createElement("span");
    name.className = "leaderboard-team";
    name.textContent = row.name;
    name.style.color = teamColor(contest, row.teamId);
    const score = document.createElement("span");
    score.className = "leaderboard-stat";
    score.textContent = `${row.score} point${row.score === 1 ? "" : "s"}`;
    const solved = document.createElement("span");
    solved.className = "leaderboard-stat";
    solved.textContent = `${row.solved} solved`;
    const territory = document.createElement("span");
    territory.className = "leaderboard-stat";
    territory.textContent = `${row.territory} cell${row.territory === 1 ? "" : "s"}`;
    item.append(rank, name, score, solved, territory);
    list.append(item);
  });
}

const RECENT_CLAIM_MS = 20000;
const seenClaimKeys = new Set();

function claimAt(contest, index) {
  return (contest.claims || []).find((claim) => claim.cell === index) || null;
}

function claimIsNew(contest, claim) {
  if (!claim || !Number.isInteger(claim.cell)) return false;
  const key = `${contest.id}:${claim.cell}:${claim.solvedAt || 0}`;
  if (seenClaimKeys.has(key)) return false;
  seenClaimKeys.add(key);
  return Number.isFinite(claim.solvedAt) && Date.now() - claim.solvedAt < RECENT_CLAIM_MS;
}

function collectRecentClaims(contest) {
  const recent = new Map();
  for (const claim of contest.claims || []) {
    if (claimIsNew(contest, claim)) recent.set(claim.cell, claim);
  }
  return recent;
}

function renderTerritoryLines(grid, contest, recentClaims) {
  const old = grid.querySelector(".territory-lines");
  if (old) old.remove();
  if (!contest.spawnResolved) return;

  const ownerByCell = new Map();
  for (const spawn of contest.spawns || []) {
    if (Number.isInteger(spawn.cell)) ownerByCell.set(spawn.cell, spawn.teamId);
  }
  for (const claim of contest.claims || []) {
    if (Number.isInteger(claim.cell)) ownerByCell.set(claim.cell, claim.teamId);
  }
  if (ownerByCell.size === 0) return;

  const cols = Number(grid.dataset.cols) || 1;
  const rows = Number(grid.dataset.rows) || 1;
  const overlay = document.createElement("div");
  overlay.className = "territory-lines";
  overlay.setAttribute("aria-hidden", "true");

  const addLine = (from, to, teamId) => {
    const fromRow = Math.floor(from / cols);
    const fromCol = from % cols;
    const toRow = Math.floor(to / cols);
    const toCol = to % cols;
    const horizontal = fromRow === toRow;
    const line = document.createElement("span");
    const recent = recentClaims.has(from) || recentClaims.has(to);
    line.className = `territory-line ${horizontal ? "horizontal" : "vertical"}${recent ? " recent" : ""}`;
    line.style.setProperty("--team", teamColor(contest, teamId));
    if (horizontal) {
      line.style.left = `calc(${fromCol} * (var(--cell, 48px) + 2px) + var(--cell, 48px) / 2)`;
      line.style.top = `calc(${fromRow} * (var(--cell, 48px) + 2px) + var(--cell, 48px) / 2 - 1.5px)`;
    } else {
      line.style.left = `calc(${fromCol} * (var(--cell, 48px) + 2px) + var(--cell, 48px) / 2 - 1.5px)`;
      line.style.top = `calc(${fromRow} * (var(--cell, 48px) + 2px) + var(--cell, 48px) / 2)`;
    }
    overlay.append(line);
  };

  for (const [cell, teamId] of ownerByCell) {
    const row = Math.floor(cell / cols);
    const col = cell % cols;
    if (col + 1 < cols && ownerByCell.get(cell + 1) === teamId) addLine(cell, cell + 1, teamId);
    if (row + 1 < rows && ownerByCell.get(cell + cols) === teamId) addLine(cell, cell + cols, teamId);
  }
  grid.append(overlay);
}

function cellInContest(contest, cell) {
  if (cell?.kind === "problem" && cell.type === "testing" && !isTestingContest(contest)) return { kind: "empty" };
  return cell;
}

function paintPlayGrid(grid, contest, map, options) {
  grid.dataset.cols = String(map.cols);
  grid.dataset.rows = String(map.rows);
  layoutMapGrid(grid, map.cols, map.rows);
  grid.replaceChildren();
  const recentClaims = collectRecentClaims(contest);
  const choosing = options.student && options.phase === "spawn" && !contest.spawnResolved;
  map.cells.forEach((rawCell, index) => {
    const cell = cellInContest(contest, rawCell);
    const button = document.createElement("button");
    const row = Math.floor(index / map.cols) + 1;
    const column = (index % map.cols) + 1;
    const claim = claimAt(contest, index);
    button.type = "button";
    button.dataset.index = String(index);
    const owner = ownerAt(contest, index, cell);
    if (options.student) {
      const reachable = options.phase === "live" && !options.frozen && cell.kind === "problem"
        && !claim
        && adjacentToTeam(map, contest, options.team?.id, index);
      button.className = cellClassName(cell, "grid-cell", "student-cell");
      button.disabled = !((choosing && cell.kind === "spawnpoint") || reachable);
      const solvedByOther = owner && cell.kind === "problem" && owner.id !== options.team?.id;
      if (solvedByOther) {
        button.classList.add("taken");
        button.style.setProperty("--team", teamColor(contest, owner.id));
        if (recentClaims.has(index)) button.classList.add("just-taken");
      } else if (owner && contest.spawnResolved) {
        button.classList.add("owned");
        if (options.team && owner.id === options.team.id) button.classList.add("mine");
        button.style.setProperty("--team", teamColor(contest, owner.id));
        button.classList.add("territory-dot");
        button.textContent = "";
        if (claim?.pending) button.classList.add("claim-pending");
        else if (recentClaims.has(index)) button.classList.add("just-claimed");
      } else {
        const myVote = choosing
          ? (contest.spawnVotes || []).find((vote) => vote.teamId === options.team?.id && sameContestant(vote.username, contestantId()))
          : null;
        const teammateVote = choosing && (contest.spawnVotes || []).some((vote) => vote.teamId === options.team?.id && vote.cell === index && !sameContestant(vote.username, contestantId()));
        if (myVote && myVote.cell === index) {
          button.classList.add("mine");
          button.style.setProperty("--team", teamColor(contest, options.team.id));
        } else if (teammateVote) {
          button.classList.add("proposed");
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
        if (recentClaims.has(index)) {
          button.classList.add("just-claimed");
          button.style.setProperty("--team", teamColor(contest, owner.id));
        }
      }
    }
    button.setAttribute("aria-label", studentCellLabel(contest, cell, row, column, index));
    grid.append(button);
  });
  renderTerritoryLines(grid, contest, recentClaims);
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
const CONTEST_SYNC_ACTIVE_MS = 5000;
const CONTEST_SYNC_IDLE_MS = 20000;
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

document?.addEventListener("mousemove", noteMouseMove, { passive: true });
document?.addEventListener("visibilitychange", () => {
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
      votes: contest.spawnVotes,
      spawns: contest.spawns,
      resolved: contest.spawnResolved,
      resolvedTeams: contest.resolvedTeams,
      claims: contest.claims,
    });
    if (key === contestSyncKey) return;
    contestSyncKey = key;
    if (studentPlayView && !studentPlayView.hidden) renderStudentPlay();
    else if (contestView && !contestView.hidden) {
      const map = maps.find((item) => item.id === contest.mapId);
      renderContestTeams(contest, map);
      renderLeaderboard(contestLeaderboard, contestLeaderboardEmpty, contest);
      renderAdminBoard(isTestingContest(contest) ? contestAsTeam(contest, adminViewTeamId) : contest, map);
    }
  } catch {
    // The next tick tries again.
  }
}

function requireSession() {
  if (isSignedIn()) return true;
  location.replace("/login.html");
  return false;
}

function applyAccount() {
  if (!isSignedIn()) {
    location.replace("/login.html");
    return;
  }

  const contestant = isContestant();
  const user = session.user;
  if (mapsButton) mapsButton.hidden = contestant;
  if (problemsButton) problemsButton.hidden = contestant;
  if (tutorialButton) tutorialButton.hidden = contestant;
  if (settingsButton) settingsButton.hidden = false;
  if (accountRole) accountRole.textContent = user.role === "admin" ? "Admin" : "Student";
  const pfp = safePfp(user.pfp);
  if (accountPfp) {
    accountPfp.hidden = !pfp;
    accountPfp.src = pfp;
  }
  updateHomeLead();
}

function updateHomeLead() {
  if (!homeLead) return;
  const user = session?.user;
  homeLead.textContent = isContestant()
    ? `Signed in as ${user.displayName || user.username}. Open Contests, agree on a spawn point with your team, then solve problems next to your territory.`
    : "Welcome to Territory Game.";
}

function logOut() {
  session = null;
  persistSession();
  location.replace("/login.html");
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
  if (editingTeamId) resetTeamForm();
  openMapId = null;
  openContestId = contestId;
  adminViewTeamId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  contestView.hidden = false;
  setCurrentSection(competitionsButton);
  renderContest();
}

function isTestingContest(contest) {
  return contest?.mode === "testing";
}

function teamSpawnReady(contest, teamId) {
  if (!contest) return false;
  if (isTestingContest(contest)) return (contest.resolvedTeams || []).includes(teamId);
  return contest.spawnResolved === true;
}

function contestAsTeam(contest, teamId) {
  if (!isTestingContest(contest) || !teamId) return contest;
  return {
    ...contest,
    teams: (contest.teams || []).filter((team) => team.id === teamId),
    spawnResolved: teamSpawnReady(contest, teamId),
    spawnChoices: (contest.spawnChoices || []).filter((choice) => choice.teamId === teamId),
    spawnVotes: (contest.spawnVotes || []).filter((vote) => vote.teamId === teamId),
    spawns: (contest.spawns || []).filter((spawn) => spawn.teamId === teamId),
    claims: (contest.claims || []).filter((claim) => claim.teamId === teamId),
  };
}

function onCreateContestModeClick(event) {
  const button = event.target.closest("[data-contest-mode]");
  if (!button) return;
  newContestMode = button.dataset.contestMode === "testing" ? "testing" : "competition";
  renderContestModeButtons(createContestMode, newContestMode);
  if (contestMapSelect) {
    fillMapSelect(contestMapSelect, contestMapSelect.value, newContestMode);
    updateContestSpawnNote(contestMapSelect, contestMapNote);
  }
}

function onContestModeClick(event) {
  const button = event.target.closest("[data-contest-mode]");
  const contest = currentContest();
  if (!button || !contest || isContestant()) return;
  const mode = button.dataset.contestMode === "testing" ? "testing" : "competition";
  if (contest.mode === mode) return;
  contest.mode = mode;
  contest.spawns = [];
  contest.spawnChoices = [];
  contest.spawnVotes = [];
  contest.claims = [];
  contest.spawnResolved = false;
  contest.resolvedTeams = [];
  adminViewTeamId = null;
  renderContest();
  persistContests();
}

function onTestingTeamViewClick(event) {
  const button = event.target.closest("[data-view-team]");
  if (!button) return;
  adminViewTeamId = button.dataset.viewTeam;
  const contest = currentContest();
  const map = contest && maps.find((item) => item.id === contest.mapId);
  renderTestingTeamView(contest);
  renderAdminBoard(contestAsTeam(contest, adminViewTeamId), map);
}

function renderContestModeButtons(container, mode) {
  if (!container) return;
  for (const button of container.querySelectorAll("[data-contest-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.contestMode === mode));
  }
}

function renderTestingTeamView(contest) {
  if (!testingTeamView) return;
  const testing = isTestingContest(contest);
  testingTeamView.hidden = !testing;
  testingTeamView.replaceChildren();
  if (!testing) return;
  if (!adminViewTeamId || !(contest.teams || []).some((team) => team.id === adminViewTeamId)) {
    adminViewTeamId = contest.teams?.[0]?.id || null;
  }
  for (const team of contest.teams || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.viewTeam = team.id;
    button.textContent = team.name;
    button.setAttribute("aria-pressed", String(team.id === adminViewTeamId));
    testingTeamView.append(button);
  }
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
  const map = maps.find((item) => item.id === mapId);
  const wanted = newContestMode === "testing" ? "testing" : "official";
  if (!map || mapMode(map) !== wanted) {
    contestFormError.hidden = false;
    contestFormError.textContent = wanted === "testing"
      ? "Choose a testing map for a testing contest."
      : "Choose an official map for a competition.";
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
    spawnVotes: [],
    spawns: [],
    claims: [],
    spawnResolved: false,
    startAt: schedule.startAt,
    durationMinutes: schedule.durationMinutes,
    spawnMinutes: schedule.spawnMinutes,
    readyMinutes: schedule.readyMinutes,
    mode: newContestMode,
  });
  persistContests();
  contestNameInput.value = "";
  renderCompetitions();
}

function onContestListClick(event) {
  const openButton = event.target.closest("[data-open-contest]");
  if (openButton) navigateTo(["contests", openButton.dataset.openContest]);
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
  navigateTo("contests", { replace: true });
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
    contest.spawnVotes = [];
    contest.claims = [];
    contest.spawnResolved = false;
    contest.resolvedTeams = [];
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

function renderTeamForm() {
  if (teamSubmitButton) teamSubmitButton.textContent = editingTeamId ? "Save team" : "Add team";
  if (teamCancelEdit) teamCancelEdit.hidden = !editingTeamId;
  if (teamEditNote) {
    teamEditNote.hidden = !editingTeamId;
    teamEditNote.textContent = editingTeamId
      ? "Editing an existing team. Removed members lose their spawn pick; a change here is saved immediately."
      : "";
  }
}

function resetTeamForm() {
  editingTeamId = null;
  if (teamNameInput) teamNameInput.value = "";
  if (teamMembersInput) teamMembersInput.value = "";
  if (teamFormError) teamFormError.hidden = true;
  renderTeamForm();
}

function beginEditTeam(teamId) {
  const contest = currentContest();
  const team = (contest?.teams || []).find((item) => item.id === teamId);
  if (!team || isContestant()) return;
  editingTeamId = teamId;
  teamNameInput.value = team.name;
  teamMembersInput.value = team.members.join("\n");
  teamFormError.hidden = true;
  renderTeamForm();
  teamNameInput.focus();
  teamForm?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelTeamEdit() {
  resetTeamForm();
}

async function saveTeam(event) {
  event.preventDefault();
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const name = readContestName(teamNameInput.value);
  const members = teamMembersInput.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  if (!name) {
    teamFormError.hidden = false;
    teamFormError.textContent = "Give the team a name.";
    return;
  }
  if (members.length < 1 || members.length > 5 || new Set(members.map((item) => item.toLowerCase())).size !== members.length) {
    teamFormError.hidden = false;
    teamFormError.textContent = "Enter 1 to 5 different student usernames, one per line.";
    return;
  }
  const duplicateName = (contest.teams || []).some((team) => team.id !== editingTeamId && team.name.trim().toLowerCase() === name.toLowerCase());
  if (duplicateName) {
    teamFormError.hidden = false;
    teamFormError.textContent = "Another team in this contest already has that name.";
    return;
  }
  teamFormError.hidden = true;
  if (teamSubmitButton) teamSubmitButton.disabled = true;
  try {
    await saveContestsNow();
    const body = { contestId: contest.id, name, members };
    if (editingTeamId) body.teamId = editingTeamId;
    const data = await apiCall("save-team", body);
    applyContestPlayState(contest, data);
    resetTeamForm();
    renderContest();
  } catch (error) {
    teamFormError.hidden = false;
    teamFormError.textContent = error.message;
  } finally {
    if (teamSubmitButton) teamSubmitButton.disabled = false;
  }
}

async function onContestantListClick(event) {
  if (isContestant()) return;
  const editButton = event.target.closest("[data-edit-team]");
  if (editButton) {
    beginEditTeam(editButton.dataset.editTeam);
    return;
  }
  const button = event.target.closest("[data-remove-team]");
  if (!button) return;
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
    spawnVotes: (contest.spawnVotes || []).slice(),
    spawns: contest.spawns.slice(),
    claims: contest.claims.slice(),
    spawnResolved: contest.spawnResolved,
  };
  if (editingTeamId === teamId) resetTeamForm();
  contest.teams = previous.teams.filter((team) => team.id !== teamId);
  contest.spawnChoices = previous.spawnChoices.filter((choice) => choice.teamId !== teamId);
  contest.spawnVotes = previous.spawnVotes.filter((vote) => vote.teamId !== teamId);
  contest.spawns = previous.spawns.filter((spawn) => spawn.teamId !== teamId);
  contest.claims = previous.claims.filter((claim) => claim.teamId !== teamId);
  if (contest.teams.length === 0) contest.spawnResolved = false;
  renderContest();
  try {
    const data = await apiCall("remove-team", { contestId: contest.id, teamId });
    applyContestPlayState(contest, data);
  } catch (error) {
    Object.assign(contest, previous);
    showPageToast(error.message, "warn");
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
    : "Contests, schedules, teams, and scores.";
  if (!contestant) {
    fillMapSelect(contestMapSelect, contestMapSelect.value, newContestMode);
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

    openButton.type = "button";
    openButton.className = "open-problem";
    openButton.dataset.openContest = contest.id;
    openButton.setAttribute("aria-label", `Open contest ${contest.name}`);
    name.className = "contest-name-label";
    name.textContent = contest.name;
    detail.className = "problem-snippet";
    detail.textContent = contestListPreview(contest, map);
    openButton.append(name, detail);
    item.append(openButton);
    contestList.append(item);
  }
}

function renderContest() {
  const contest = currentContest();
  if (!contest) {
    showCompetitions();
    setHashSilently("contests");
    return;
  }

  const map = maps.find((item) => item.id === contest.mapId);
  contestTitle.textContent = contest.name;
  contestNameField.value = contest.name;
  fillMapSelect(contestMapField, contest.mapId, isTestingContest(contest) ? "testing" : "competition", true);
  fillContestSchedule(contest);
  updateContestSpawnNote(contestMapField, contestMapEditNote);
  contestScheduleError.hidden = true;
  renderContestModeButtons(contestModeChoices, isTestingContest(contest) ? "testing" : "competition");
  if (contestModeNote) {
    contestModeNote.textContent = isTestingContest(contest)
      ? "Testing contest. Each team plays its own copy of the map. Changing this clears scores and spawn points."
      : "Competition. Every team shares one map. Changing this clears scores and spawn points.";
  }
  if (contestTeamLead) {
    contestTeamLead.textContent = isTestingContest(contest)
      ? "Add as many teams as you need. Each team has 1 to 5 students and plays alone on this map."
      : "A team has 1 to 5 students and shares one spawn point, territory, and score.";
  }
  if (contestLeaderboardHeading) {
    contestLeaderboardHeading.textContent = isTestingContest(contest) ? "Team scores" : "Leaderboard";
  }
  renderTestingTeamView(contest);
  deleteOpenContestButton.setAttribute("aria-label", `Delete contest ${contest.name}`);
  if (editingTeamId && !(contest.teams || []).some((team) => team.id === editingTeamId)) {
    resetTeamForm();
  } else {
    renderTeamForm();
  }
  renderContestTeams(contest, map);
  updateContestTeamNote(contest, map);
  renderLeaderboard(contestLeaderboard, contestLeaderboardEmpty, contest);
  renderAdminBoard(isTestingContest(contest) ? contestAsTeam(contest, adminViewTeamId) : contest, map);
  paintPhaseClocks();
  ensureContestClock();
}

function updateContestTeamNote(contest, map) {
  if (!contestTeamNote) return;
  const teams = (contest?.teams || []).length;
  if (!map) {
    contestTeamNote.hidden = true;
    return;
  }
  const spawnCount = map.cells.filter((cell) => cell.kind === "spawnpoint").length;
  contestTeamNote.hidden = false;
  if (spawnCount === 0) {
    contestTeamNote.textContent = "This map has no spawn points. Place spawn points on the map before adding teams.";
    return;
  }
  if (isTestingContest(contest)) {
    contestTeamNote.textContent = `${teams} team${teams === 1 ? "" : "s"}. Each team uses the map's ${spawnCount} spawn point${spawnCount === 1 ? "" : "s"} on its own copy.`;
    return;
  }
  if (teams > spawnCount) {
    contestTeamNote.textContent = `Warning: ${teams} teams but only ${spawnCount} spawn points. A team without a spawn point cannot start.`;
    return;
  }
  const free = spawnCount - teams;
  contestTeamNote.textContent = `${teams} of ${spawnCount} spawn point${spawnCount === 1 ? "" : "s"} used. ${free === 0 ? "The contest is full." : `${free} team slot${free === 1 ? "" : "s"} left.`}`;
}

function renderContestTeams(contest, map) {
  const teams = contest.teams || [];
  contestantList.replaceChildren();
  contestantEmpty.hidden = teams.length > 0;
  contestantList.hidden = teams.length === 0;
  for (const team of teams) {
    const item = document.createElement("li");
    if (team.id === editingTeamId) item.classList.add("editing");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    name.className = "contest-name-label";
    const colorDot = document.createElement("span");
    colorDot.className = "team-color-dot";
    colorDot.style.setProperty("--team", teamColor(contest, team.id));
    name.append(colorDot, team.name);
    detail.className = "team-detail";
    detail.textContent = `${team.members.length} member${team.members.length === 1 ? "" : "s"} · ${team.members.join(" · ")} · ${spawnSummary(contest, map, team.id)}`;
    item.append(name, detail);
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "account-action";
    editButton.dataset.editTeam = team.id;
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${team.name}`);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "account-action danger";
    removeButton.dataset.removeTeam = team.id;
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${team.name}`);
    item.append(editButton, removeButton);
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

    openButton.type = "button";
    openButton.className = "open-problem";
    openButton.dataset.studentOpen = contest.id;
    openButton.setAttribute("aria-label", `Open contest ${contest.name}`);
    name.className = "contest-name-label";
    name.textContent = contest.name;
    detail.className = "problem-snippet";
    detail.textContent = contestListPreview(contest, map);
    openButton.append(name, detail);
    item.append(openButton);
    studentContestList.append(item);
  }
  shownListPhases = mine.map((contest) => contestPhase(contest)).join("|");
  ensureContestClock();
}

function onStudentListClick(event) {
  const openButton = event.target.closest("[data-student-open]");
  if (openButton) navigateTo(["student", openButton.dataset.studentOpen]);
}

function renderStudentPlay() {
  const contest = currentContest();
  if (!contest || !teamForUser(contest)) {
    showStudent();
    setHashSilently("student");
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
  const board = buildLeaderboard(contest);
  const row = board.find((entry) => entry.teamId === team.id);
  const rank = board.findIndex((entry) => entry.teamId === team.id);
  const ownedCells = (contest.spawnResolved && (contest.spawns || []).some((spawn) => spawn.teamId === team.id) ? 1 : 0)
    + (contest.claims || []).filter((claim) => claim.teamId === team.id).length;
  studentTeamSummary.hidden = false;
  studentTeamSummary.textContent = `Members: ${team.members.join(", ")} · Score: ${row?.score ?? 0} · Territory: ${ownedCells} cell${ownedCells === 1 ? "" : "s"} · Rank ${rank < 0 ? "—" : rank + 1} of ${board.length}.`;
  writeStudentStatus(contest, phase, map, frozen);
  renderTeamRoster(contest, map, phase);
  renderLeaderboard(studentLeaderboard, null, contest);
  const showScores = phase === "live" || phase === "ended" || frozen;
  studentLeaderboard.hidden = !showScores;
  studentLeaderboardHeading.hidden = !showScores;
  studentLeaderboardHeading.textContent = frozen || phase === "ended" ? "Leaderboard" : "Scores";
  studentBoard.hidden = !map;

  if (!map) {
    spawnAgreement.hidden = true;
    paintPhaseClocks();
    ensureContestClock();
    return;
  }

  paintPlayGrid(studentGrid, contest, map, { student: true, phase, frozen, team });
  renderSpawnAgreement(contest, map, phase);
  paintPhaseClocks();
  ensureContestClock();
}

function renderTeamRoster(contest, map, phase) {
  if (!teamRoster || !teamRosterBody) return;
  const team = teamForUser(contest);
  const show = Boolean(team && map) && (phase === "ready" || (phase === "spawn" && contest.spawnResolved));
  teamRoster.hidden = !show;
  if (!show) return;
  teamRosterBody.replaceChildren();
  const row = document.createElement("tr");
  const name = document.createElement("td");
  const dot = document.createElement("span");
  dot.className = "team-color-dot";
  dot.style.setProperty("--team", teamColor(contest, team.id));
  const label = document.createElement("span");
  label.textContent = team.name;
  name.append(dot, label);
  const members = document.createElement("td");
  members.className = "team-members-cell";
  for (const member of team.members || []) {
    const chip = document.createElement("span");
    chip.className = "team-member-chip";
    chip.textContent = member;
    members.append(chip);
  }
  const spawn = document.createElement("td");
  const spawnCell = (contest.spawns || []).find((item) => item.teamId === team.id);
  spawn.textContent = spawnCell && map.cells[spawnCell.cell]?.kind === "spawnpoint"
    ? cellPlace(map, spawnCell.cell)
    : "No spawn point";
  row.append(name, members, spawn);
  teamRosterBody.append(row);
}
function renderSpawnAgreement(contest, map, phase) {
  const team = teamForUser(contest);
  const open = Boolean(team && map && phase === "spawn" && !contest.spawnResolved);
  spawnAgreement.hidden = !open;
  if (!open) return;
  spawnVoteList.replaceChildren();
  for (const member of team.members) {
    const vote = (contest.spawnVotes || []).find((item) => item.teamId === team.id && sameContestant(item.username, member));
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = sameContestant(member, contestantId()) ? `${member} (you)` : member;
    const voteCell = document.createElement("td");
    voteCell.textContent = vote ? cellPlace(map, vote.cell) : "Waiting";
    const status = document.createElement("td");
    status.className = "member-status";
    const icon = document.createElement("i");
    icon.className = vote ? "fa-solid fa-circle-check vote-yes" : "fa-solid fa-circle-question vote-no";
    icon.setAttribute("aria-label", vote ? "Voted" : "Not voted yet");
    icon.setAttribute("title", vote ? "Voted" : "Not voted yet");
    status.append(icon);
    row.append(name, voteCell, status);
    spawnVoteList.append(row);
  }
  const agreed = (contest.spawnChoices || []).find((choice) => choice.teamId === team.id);
  const currentCell = Number.isInteger(agreed?.cell) ? agreed.cell : null;
  const cacheKey = `${contest.id}:${team.id}`;
  const previousCell = spawnAgreementCache.get(cacheKey);
  if (previousCell !== undefined && previousCell !== currentCell) {
    if (currentCell === null) {
      showPageToast("Not all team members have chosen the same spawn point yet.", "warn");
    } else {
      showPageToast(`Spawn point: ${cellPlace(map, currentCell)}`, "ok");
    }
  }
  spawnAgreementCache.set(cacheKey, currentCell);
  spawnAgreementNote.textContent = agreed
    ? `Spawn point: ${cellPlace(map, agreed.cell)}`
    : "Spawn point: not agreed yet. Every team member must choose the same cell.";
}
function writeStudentStatus(contest, phase, map, frozen) {
  const mapBit = map ? `${map.name} · ${map.cols} × ${map.rows}` : "The map for this contest has been removed.";
  const team = teamForUser(contest);
  const score = buildLeaderboard(contest).find((row) => row.teamId === team?.id);
  const scoreBit = score ? ` ${team.name} has ${score.score} point${score.score === 1 ? "" : "s"}.` : "";
  studentPlayMeta.textContent = `${mapBit}. ${isTestingContest(contest) ? "Practice map. Other teams cannot see your cells. " : ""}${phaseSentence(contest, phase, frozen)}${scoreBit}`;
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
    const count = map.cells.filter((cell) => cell.kind === "spawnpoint").length;
    studentSpawnNote.textContent = count > 0
      ? "Click the spawn point you want. It becomes your team's choice when every member has clicked that same cell."
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
  activeStudentStatementFrame = null;
  studentProblem.hidden = true;
  studentAnswerForm.hidden = true;
  if (studentAnswerSuccess) studentAnswerSuccess.hidden = true;
  for (const button of studentGrid.querySelectorAll("[aria-pressed='true']")) {
    button.removeAttribute("aria-pressed");
  }
}

function showStudentProblem(contest, map, phase, frozen) {
  const team = teamForUser(contest);
  const cell = selectedStudentCell === null ? null : cellInContest(contest, map.cells[selectedStudentCell]);
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
  if (studentAnswerSuccess) studentAnswerSuccess.hidden = true;
  studentAnswer.style.cssText = "";
  studentAnswer.readOnly = false;
  const promptText = problem && problem.prompt.trim() ? problem.prompt : "This problem has no text yet.";
  activeStudentStatementFrame = setRichText(studentProblemPrompt, promptText, { tag: studentProblemTag.textContent });
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
    if (answerOpenMode === "newtab") {
      const url = new URL("answer.html", location.href);
      url.searchParams.set("contest", contest.id);
      url.searchParams.set("cell", String(index));
      window.open(url.href, "_blank", "noopener");
      return;
    }
    selectedStudentCell = index;
    renderStudentPlay();
    showStudentProblem(contest, map, phase, false);
  }
}

async function chooseSpawn(contest, cell) {
  const team = teamForUser(contest);
  if (!team) return;
  const previousVotes = (contest.spawnVotes || []).slice();
  const previousChoices = (contest.spawnChoices || []).slice();
  contest.spawnVotes = previousVotes.filter((vote) => !(vote.teamId === team.id && sameContestant(vote.username, contestantId())));
  contest.spawnVotes.push({ teamId: team.id, username: contestantId(), cell });
  contest.spawnChoices = agreedSpawnChoices(contest);
  renderStudentPlay();
  try {
    const data = await apiCall("choose-spawn", { contestId: contest.id, cell });
    applyContestPlayState(contest, data);
    const map = maps.find((item) => item.id === contest.mapId);
    const finalSpawn = (contest.spawns || []).find((spawn) => spawn.teamId === team.id);
    const agreed = (contest.spawnChoices || []).find((choice) => choice.teamId === team.id);
    const chosenCell = Number.isInteger(finalSpawn?.cell) ? finalSpawn.cell : agreed?.cell;
    if (map && Number.isInteger(chosenCell)) {
      showPageToast(`Spawn point: ${cellPlace(map, chosenCell)}`, "ok");
    } else {
      showPageToast("Not all team members have chosen the same spawn point yet.", "warn");
    }
  } catch (error) {
    contest.spawnVotes = previousVotes;
    contest.spawnChoices = previousChoices;
    showPageToast(error.message, "warn");
  }
  renderStudentPlay();
}

async function submitStudentAnswer(event) {
  event.preventDefault();
  const contest = currentContest();
  const map = contest && maps.find((item) => item.id === contest.mapId);
  const team = contest && teamForUser(contest);
  if (!contest || !map || !team || selectedStudentCell === null) return;
  const cell = selectedStudentCell;
  const submitButton = studentAnswerForm.querySelector("button");
  if (submitButton.disabled) return;
  const submitLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Checking...";
  studentAnswerError.hidden = true;

  const approval = await approveStatementSubmit();
  if (approval.blocked) {
    submitButton.disabled = false;
    submitButton.textContent = submitLabel;
    studentAnswerError.hidden = false;
    studentAnswerError.textContent = approval.message || "Finish the problem before submitting.";
    return;
  }

  const previousClaims = (contest.claims || []).slice();
  const pendingClaim = {
    cell,
    teamId: team.id,
    solvedBy: contestantId(),
    solvedAt: Date.now(),
    pending: true,
  };
  contest.claims = previousClaims.filter((claim) => claim.cell !== cell).concat(pendingClaim);
  renderStudentPlay();

  let failure = "";
  try {
    const data = await apiCall("solve", {
      contestId: contest.id,
      cell,
      answer: studentAnswer.value,
    });
    applyContestPlayState(contest, data);
    studentAnswer.value = "";
    studentAnswerForm.hidden = true;
    if (studentAnswerSuccess) {
      studentAnswerSuccess.hidden = false;
      studentAnswerSuccess.textContent = "Answer accepted. Close this problem to continue.";
    }
  } catch (error) {
    contest.claims = previousClaims;
    failure = error.message;
  }
  submitButton.disabled = false;
  submitButton.textContent = submitLabel;
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
  paintPhaseClocks();
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
  if (phase === "spawn") return "Agreeing on spawn points";
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
      : "Agree on one spawn point with your team before this phase ends.";
  }
  if (phase === "ready") return `Spawning is closed. The contest begins ${formatContestTime(schedule.liveAt)}. Your team's outline is white.`;
  if (phase === "live") return `Solve a problem next to your territory before ${formatContestTime(schedule.endAt)}. Easy is 1, normal 2, hard 3, and insane 4.`;
  return `The contest ended ${formatContestTime(schedule.endAt)}. The board is frozen.`;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

function phaseClock(contest, now = serverNow()) {
  const phase = contestPhase(contest, now);
  const schedule = contestSchedule(contest);
  if (!schedule) return "Schedule not set";
  if (phase === "ended") return "Ended";
  const end = phase === "before" ? schedule.startAt
    : phase === "spawn" ? schedule.spawnEnd
    : phase === "ready" ? schedule.liveAt
    : schedule.endAt;
  const label = phase === "before" ? "Until spawning"
    : phase === "spawn" ? "Spawn time left"
    : phase === "ready" ? "Until the contest"
    : "Contest time left";
  return `${label} ${formatCountdown(end - now)}`;
}

function phaseClockNode(contest) {
  const node = document.createElement("span");
  node.dataset.phaseClock = contest.id;
  node.textContent = phaseClock(contest);
  return node;
}

function paintPhaseClocks() {
  const boxes = [
    [studentCountdown, studentPlayView && !studentPlayView.hidden ? currentContest() : null],
    [contestCountdown, contestView && !contestView.hidden && isAdmin() ? currentContest() : null],
  ];
  for (const [node, contest] of boxes) {
    if (!node) continue;
    const text = contest ? phaseClock(contest) : "";
    node.hidden = !text;
    node.textContent = text;
  }
  for (const node of document.querySelectorAll("[data-phase-clock]")) {
    const contest = contests.find((item) => item.id === node.dataset.phaseClock);
    if (contest) node.textContent = phaseClock(contest);
  }
}

function contestListPreview(contest, map) {
  const mapName = map ? map.name : "Map removed";
  const schedule = contestSchedule(contest);
  const when = schedule ? formatContestTime(schedule.startAt) : "Schedule not set";
  return `${mapName} · ${when}`;
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
  const team = (contest.teams || []).find((item) => item.id === teamId);
  const votes = (contest.spawnVotes || []).filter((vote) => vote.teamId === teamId);
  const ready = teamSpawnReady(contest, teamId);
  const choice = !ready
    ? (contest.spawnChoices || []).find((item) => item.teamId === teamId)
    : null;
  const spawn = ready
    ? (contest.spawns || []).find((item) => item.teamId === teamId)
    : null;
  const cell = spawn?.cell ?? choice?.cell;
  if (!Number.isInteger(cell)) {
    if (ready) return "No spawn point";
    return team ? `${votes.length} of ${team.members.length} chosen` : "Has not chosen";
  }
  if (!map || cell < 0 || cell >= map.cells.length || map.cells[cell].kind !== "spawnpoint") {
    return "Spawn point no longer on the map";
  }
  return `${ready ? "Starts" : "Agrees"} ${cellPlace(map, cell)}`;
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
    mode: raw.mode === "testing" ? "testing" : "competition",
    resolvedTeams: Array.isArray(raw.resolvedTeams) ? raw.resolvedTeams.filter((id) => typeof id === "string") : [],
    spawnChoices: normalizeTeamCells(raw.spawnChoices),
    spawnVotes: normalizeSpawnVotes(raw.spawnVotes),
    spawns: normalizeTeamCells(raw.spawns),
    claims: normalizeClaims(raw.claims),
    spawnResolved: raw.spawnResolved === true,
  };
}

function fillMapSelect(select, selectedId, contestMode = "competition", keepCurrent = false) {
  const previous = selectedId || select.value;
  const wanted = contestMode === "testing" ? "testing" : "official";
  const choices = maps.filter((map) => mapMode(map) === wanted || (keepCurrent && map.id === previous));
  select.replaceChildren();
  if (choices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = wanted === "testing" ? "No testing maps yet" : "No official maps yet";
    select.append(option);
    return;
  }
  for (const map of choices) {
    const option = document.createElement("option");
    option.value = map.id;
    const kind = mapMode(map) === "testing" ? "Testing" : "Official";
    option.textContent = `${mapOptionLabel(map)} · ${kind}`;
    select.append(option);
  }
  if (previous && choices.some((map) => map.id === previous)) {
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
    location.replace("/login.html");
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
    versions = Array.isArray(data.versions) ? data.versions.map(loadedVersion) : [];
    if (data.revisions) {
      for (const name of ["maps", "problems", "contests"]) {
        if (Number.isInteger(data.revisions[name])) revisions[name] = data.revisions[name];
      }
    }
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
    if (ROUTED) startRouter();
    else openSplitPage();
  } catch (e) {
    console.error("[bootstrap]", e);
    if (String(e.message).includes("Unauthorized")) {
      logOut();
      return;
    }
    bootstrapped = false;
    if (loadError) {
      loadError.hidden = false;
      loadError.textContent = "The game data could not be loaded, so changes will not be saved. Refresh the page to try again.";
    }
    applyAccount();
    updateHomeLead();
    if (ROUTED) startRouter();
    else openSplitPage();
  }
  if (!ROUTED) {
    window.addEventListener("popstate", () => {
      if (bootstrapped) openSplitPage();
    });
  }
}

function openSplitPage() {
  if (!isSignedIn()) return;
  const adminPath = location.pathname.startsWith("/admin/");
  const contestant = isContestant();
  if (contestant && adminPath && !location.pathname.endsWith("/credits.html")) {
    location.replace("/index.html");
    return;
  }
  if (!contestant && !adminPath) {
    location.replace("/admin/maps.html");
    return;
  }

  const params = new URLSearchParams(location.search);
  if (contestant && studentView) {
    if (params.get("settings") && studentSettingsView) showStudentSettings();
    else if (params.get("contest")) showStudentPlay(params.get("contest"));
    else showStudent();
    return;
  }
  if (problemsView) {
    const type = params.get("type");
    const index = Number(params.get("index"));
    if (params.get("from") === "map" && params.get("map")) openMapId = params.get("map");
    if (typeInfo(type) && params.get("batch")) showProblemBatch(type);
    else if (typeInfo(type) && params.has("index") && Number.isInteger(index)) showProblemEditor(index, type, params.get("from") === "map");
    else {
      activeProblemType = typeInfo(type) ? type : null;
      showProblems();
    }
    return;
  }
  if (mapsView) {
    const mapId = params.get("map");
    if (mapId && maps.some((map) => map.id === mapId)) showEditor(mapId);
    else showMaps();
    return;
  }
  if (competitionsView) {
    const id = params.get("id");
    if (id && contests.some((contest) => contest.id === id)) showContest(id);
    else showCompetitions();
    return;
  }
  if (settingsView) showSettings();
  else if (tutorialView) showTutorial();
  else if (creditsView) showCredits();
}

bootstrap();
// ═══════════════════════════════════════════════════════════════════
// Credits / versions
// ═══════════════════════════════════════════════════════════════════

function loadedVersion(raw) {
  const version = String(raw?.version || "").trim().slice(0, 40);
  const message = String(raw?.message || "").slice(0, 4000);
  if (!version || !message) return null;
  return {
    id: String(raw.id || ""),
    version,
    message,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
  };
}

function showCredits() {
  if (!requireSession() || !creditsView) return;
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  creditsView.hidden = false;
  setCurrentSection(creditsButton);
  if (versionForm) versionForm.hidden = !isAdmin();
  renderVersions();
}

function renderVersions() {
  if (!versionList || !versionEmpty) return;
  versionList.replaceChildren();
  const notes = versions.filter(Boolean);
  versionEmpty.hidden = notes.length > 0;
  versionList.hidden = notes.length === 0;
  for (const note of notes) {
    const item = document.createElement("li");
    const name = document.createElement("p");
    const message = document.createElement("p");
    const time = document.createElement("p");
    name.className = "version-name";
    name.textContent = note.version;
    message.className = "version-message";
    message.textContent = note.message;
    time.className = "version-time";
    time.textContent = note.createdAt ? formatContestTime(note.createdAt) : "";
    item.append(name, message, time);
    versionList.append(item);
  }
}

async function addVersion(event) {
  event.preventDefault();
  if (!isAdmin() || !versionNameInput || !versionMessageInput) return;
  const version = versionNameInput.value.trim();
  const message = versionMessageInput.value.trim();
  if (!version || !message) {
    versionFormError.hidden = false;
    versionFormError.textContent = "Add both a version and a message.";
    return;
  }
  versionFormError.hidden = true;
  try {
    const data = await apiCall("add-version", { version, message });
    versions = Array.isArray(data.versions) ? data.versions.map(loadedVersion).filter(Boolean) : versions;
    versionNameInput.value = "";
    versionMessageInput.value = "";
    renderVersions();
  } catch (error) {
    versionFormError.hidden = false;
    versionFormError.textContent = error.message;
  }
}
