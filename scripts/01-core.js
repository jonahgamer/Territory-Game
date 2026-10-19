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
  { id: "math", name: "Math", tag: "MO" },
  { id: "oi", name: "OI", tag: "OI" },
  { id: "science", name: "Science", tag: "SCI" },
  { id: "puzzle", name: "Puzzle", tag: "PUZ" },
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
let accountFilter = "all";
let accountQuery = "";
let accountStatusTimer = null;
let pageToastTimer = null;
const spawnAgreementCache = new Map();
const ANSWER_OPEN_MODE_KEY = "territory-answer-open-mode";
let answerOpenMode = readAnswerOpenMode();

// Routing is only enabled on the full single-page app. The split pages in
// ui2/ keep their own real URLs and are handled by openSplitPage().
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
// ui2/ pages keep their own real URLs and call openSplitPage() instead.

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
  if (!ROUTED) return;
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
  if (!ROUTED) return;
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
    if (isContestant()) showStudent();
    else showHome();
    canonical = defaultRouteHash();
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


