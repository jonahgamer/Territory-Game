import { requireContestant, getSession, sameContestant } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { el, renderList } from "../shared/dom.js";
import {
  contestPhase, phaseSentence, phaseClock, noteServerTime, formatContestTime,
} from "../shared/contest-time.js";
import { teamForUser, teamColor, teamShort, teamEnergy, agreedSpawnChoices, normalizeTeamCells, normalizeSpawnVotes, normalizeClaims, normalizeTeams } from "../shared/contest-data.js";
import { readEnergySettings } from "../shared/energy.js";
import { layoutMapGrid, mapBackdrop, cellClassName, cellText, cellLabel, paintPhotoGrid } from "../shared/map-render.js?v=mem";
import { DIFFICULTY_NAME, ANSWER_OPEN_MODE_KEY } from "../shared/constants.js";
import { problemDifficulty, problemTag, problemScore } from "../shared/difficulty.js";
import { contestMapIds, primaryMapId, teleportLabel, teleportPairAt } from "../shared/contest-board.js";
import { drawTeleportLinks } from "../shared/teleport-link.js";
import { publishContestPatch, watchContestPatch } from "../shared/contest-sync.js";
import { createStatementView } from "../shared/statement.js";

// ── 顶层常量 ─────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const contestId = params.get("contest") || "";

// ── Difficulty colour reference ──────────────────────────
const TIER_VALUE = { easy: 1, normal: 2, medium: 2, hard: 3, insane: 4 };

// Four muted difficulty colours, easy → insane.
const GREEN_ANCHOR = {
  1: { r: 0x0a, g: 0x46, b: 0x05 }, // easy   – #0a4605 deep forest green
  2: { r: 0x73, g: 0x86, b: 0x2e }, // med    – #73862e olive
  3: { r: 0x97, g: 0x37, b: 0x1a }, // hard   – #97371a rust
  4: { r: 0x64, g: 0x15, b: 0x60 }, // insane – #641560 plum
};

const OTHER_COLOURS = {
  obstacle:   { r: 0x3a, g: 0x3a, b: 0x3a },
  spawnpoint: { r: 0x74, g: 0xb4, b: 0xc7 },
  teleport:   { r: 0xd7, g: 0xf6, b: 0xff },
  empty:      { r: 0x11, g: 0x11, b: 0x17 },
  unknown:    { r: 0x5a, g: 0x5a, b: 0x5a },
};

// ── Pan / zoom limits ────────────────────────────────────
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.12;                  // on-screen +/- buttons: gentler per click
const PINCH_DAMP = 0.8;                  // exponent on touch-pinch ratio
const WHEEL_ZOOM_SENSITIVITY = 0.0012;   // per pixel of deltaY (mouse wheel & trackpad scroll)
const WHEEL_PINCH_SENSITIVITY = 0.0040;  // ctrl+wheel = trackpad pinch gesture
const WHEEL_DELTA_CLAMP = 120;           // cap runaway deltas from some mice/drivers

// ── Dot sizing ───────────────────────────────────────────
// Occupied-team dot (non-spawn): 78 % of the cell.
// Occupied spawn dot:            96 % of the cell (still pulsing).
// Unclaimed spawn:               plain, no dot.
const DOT_DIAMETER_PCT = 78;
const SPAWN_DIAMETER_PCT = 96;

// ── 状态 ─────────────────────────────────────────────────
const state = {
  maps: [], problems: [], contest: null,
  selectedCell: null, syncAt: 0, clock: null, lastMouse: Date.now(),
  phase: "", frozen: false, spawnCache: new Map(),
  view: { scale: 1, x: 0, y: 0 },
};

// ── Statement view ───────────────────────────────────────
const statement = createStatementView(document.querySelector("#student-problem-prompt"), {
  onAnswerValue: (v) => { document.querySelector("#student-answer").value = v; },
  onAnswerStyle: (css) => { document.querySelector("#student-answer").style.cssText = css; },
  onAnswerReadOnly: (ro) => { document.querySelector("#student-answer").readOnly = ro; },
  onAnswerError: (hidden, text) => {
    const e = document.querySelector("#student-answer-error");
    e.hidden = hidden; e.textContent = text;
  },
});

// ── 函数 ─────────────────────────────────────────────────
async function run() {
  if (!contestId) throw new Error("No contest selected.");
  const data = await loadPage("page-play", { contest: contestId });
  state.maps = data.maps;
  state.problems = data.problems;
  state.contest = data.contest;
  if (!state.contest) throw new Error("Contest not found.");
  if (!teamForUser(state.contest)) throw new Error("You are not on a team in this contest.");
  bindEvents();
  render();
  startClock();
  watchContestPatch(contestId, (patch) => {
    applyPlayState({ contest: patch, serverNow: patch.serverNow });
    render();
  });
}

function bindBackToTop() {
  const resetAndScroll = () => {
    state.view = { scale: 1, x: 0, y: 0 };
    state.applyView?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mobileBtn  = document.querySelector("#back-to-top");
  const desktopBtn = document.querySelector("#back-to-top-desktop");

  // Force the mobile button to render even if `.mobile-bar`
  // rules (flex: 1 on the logo, nowrap, etc.) would hide or
  // collapse it. Inline styles win over the stylesheet.
  if (mobileBtn) {
    Object.assign(mobileBtn.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
      minWidth: "36px",
      flex: "0 0 auto",
      padding: "0",
      margin: "0 8px",
      borderRadius: "6px",
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(255,255,255,0.08)",
      color: "inherit",
      fontSize: "16px",
      cursor: "pointer",
      visibility: "visible",
      opacity: "1",
      position: "relative",
      zIndex: "2",
    });
    mobileBtn.addEventListener("click", resetAndScroll);
  }

  if (desktopBtn) desktopBtn.addEventListener("click", resetAndScroll);
}

function bindEvents() {
  document.querySelector("#student-problem-close")?.addEventListener("click", closeProblem);
  const grid = document.querySelector("#student-maps");
  grid?.addEventListener("click", onGridClick);
  grid?.addEventListener("pointerover", showCellTip);
  grid?.addEventListener("pointermove", showCellTip);
  grid?.addEventListener("pointerout", (event) => {
    if (event.target.closest(".grid-cell") && event.relatedTarget?.closest?.("#student-maps .grid-cell") === event.target.closest(".grid-cell")) return;
    const tip = document.querySelector("#cell-tooltip");
    if (tip && !event.relatedTarget?.closest?.("#student-maps")) tip.hidden = true;
  });
  document.querySelector("#student-answer-form")?.addEventListener("submit", submitAnswer);
  document.addEventListener("mousemove", () => {
    const wasIdle = Date.now() - state.lastMouse >= 5000;
    state.lastMouse = Date.now();
    if (wasIdle) state.syncAt = 0;
  }, { passive: true });

  installPanZoom();
  bindBackToTop();
  bindZoomControlsNearTop();
}

function answerOpenMode() {
  const username = getSession()?.user?.username || "";
  const key = username ? `${ANSWER_OPEN_MODE_KEY}:${username}` : ANSWER_OPEN_MODE_KEY;
  try { return localStorage.getItem(key) === "newtab" ? "newtab" : "current"; }
  catch { return "current"; }
}

// ──────────────────────────────────────────────────────────
// PAN + ZOOM
// ──────────────────────────────────────────────────────────
function installPanZoom() {
  const board = document.querySelector("#student-board");
  const grid  = document.querySelector("#student-maps");
  if (!board || !grid) return;

  board.style.position = "relative";
  board.style.overflow = "hidden";
  board.style.touchAction = "none";
  board.style.cursor = "grab";

  grid.style.transformOrigin = "0 0";
  grid.style.willChange = "transform";
  grid.style.userSelect = "none";

  const applyView = () => {
    const { scale, x, y } = state.view;
    grid.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    refreshDotFontSizes();
  };
  state.applyView = applyView;

  // Convert a client point into the grid's local (untransformed) coords.
  // Also exposes the grid's untransformed origin so we can re-anchor
  // after a scale change — independent of board padding / page scroll.
  const clientToLocal = (clientX, clientY) => {
    const rect = grid.getBoundingClientRect();
    const s = state.view.scale || 1;
    return {
      x: (clientX - rect.left) / s,
      y: (clientY - rect.top) / s,
      originX: rect.left - state.view.x,
      originY: rect.top - state.view.y,
    };
  };

  const zoomAtClient = (clientX, clientY, factor) => {
    const v = state.view;
    const nextScale = clamp(v.scale * factor, ZOOM_MIN, ZOOM_MAX);
    if (nextScale === v.scale) return;
    const { x: localX, y: localY, originX, originY } = clientToLocal(clientX, clientY);
    v.scale = nextScale;
    v.x = clientX - originX - localX * nextScale;
    v.y = clientY - originY - localY * nextScale;
    applyView();
  };
  state.zoomAtClient = zoomAtClient;

  const zoomAtVisibleCenter = (factor) => {
    const rect = board.getBoundingClientRect();
    const left   = Math.max(rect.left, 0);
    const right  = Math.min(rect.right, window.innerWidth);
    const top    = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    const cx = right > left ? (left + right) / 2 : rect.left + rect.width / 2;
    const cy = bottom > top ? (top + bottom) / 2 : rect.top + rect.height / 2;
    zoomAtClient(cx, cy, factor);
  };
  state.zoomAtVisibleCenter = zoomAtVisibleCenter;

    board.addEventListener("wheel", (event) => {
    if (!event.target.closest?.("#student-board")) return;
    event.preventDefault();

    // Normalise delta across deltaMode (0 = pixels, 1 = lines, 2 = pages).
    let dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= 100;
    dy = clamp(dy, -WHEEL_DELTA_CLAMP, WHEEL_DELTA_CLAMP);

    // Trackpad pinch arrives as ctrl+wheel with very small deltas → needs more gain.
    const sens = event.ctrlKey ? WHEEL_PINCH_SENSITIVITY : WHEEL_ZOOM_SENSITIVITY;
    const factor = Math.exp(-dy * sens);

    // Ignore micro-jitter so sideways trackpad drift doesn't shift the map.
    if (Math.abs(factor - 1) < 1e-4) return;

    zoomAtClient(event.clientX, event.clientY, factor);
  }, { passive: false });

  const pointers = new Map();
  let pinchStart = null;
  let dragging = false;
  let dragStart = null;
  let moved = false;
  let dragCapturedId = null;

  const getMid = () => {
    const pts = [...pointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  };
  const getDist = () => {
    const pts = [...pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  board.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = false;

    if (pointers.size === 1) {
      dragging = true;
      dragStart = { px: event.clientX, py: event.clientY, vx: state.view.x, vy: state.view.y };
      board.style.cursor = "grabbing";
    } else if (pointers.size === 2) {
      dragging = false;
      for (const id of pointers.keys()) {
        try { board.setPointerCapture(id); dragCapturedId = id; } catch {}
      }
      const mid = getMid();
      const { x: localX, y: localY } = clientToLocal(mid.x, mid.y);
      pinchStart = {
        dist: getDist(),
        scale: state.view.scale,
        localX,
        localY,
      };
    }
  });

  board.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1 && dragging && dragStart) {
      const dx = event.clientX - dragStart.px;
      const dy = event.clientY - dragStart.py;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 3) {
        moved = true;
        try { board.setPointerCapture(event.pointerId); dragCapturedId = event.pointerId; } catch {}
      }
      if (moved) {
        state.view.x = dragStart.vx + dx;
        state.view.y = dragStart.vy + dy;
        applyView();
      }
    } else if (pointers.size === 2 && pinchStart) {
      moved = true;
      const rawFactor = getDist() / pinchStart.dist;
      // Soften so small finger movements don't cause a large zoom jump.
      const factor = Math.pow(rawFactor, PINCH_DAMP);
      const nextScale = clamp(pinchStart.scale * factor, ZOOM_MIN, ZOOM_MAX);
      const mid = getMid();

      // Recompute the grid's untransformed origin from its CURRENT
      // transformed rect — robust against page scroll / layout shift.
      const rect = grid.getBoundingClientRect();
      const originX = rect.left - state.view.x;
      const originY = rect.top  - state.view.y;

      state.view.scale = nextScale;
      // Keep the local point that was under the initial midpoint
      // pinned under the current midpoint → pinch at the right spot.
      state.view.x = mid.x - originX - pinchStart.localX * nextScale;
      state.view.y = mid.y - originY - pinchStart.localY * nextScale;
      applyView();
    }
  });

  const endPointer = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (dragCapturedId === event.pointerId) {
      try { board.releasePointerCapture(event.pointerId); } catch {}
      dragCapturedId = null;
    }
    if (pointers.size === 0) {
      dragging = false; dragStart = null; pinchStart = null;
      board.style.cursor = "grab";
    } else if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      dragging = true;
      dragStart = { px: remaining.x, py: remaining.y, vx: state.view.x, vy: state.view.y };
      pinchStart = null;
    }
  };
  board.addEventListener("pointerup", endPointer);
  board.addEventListener("pointercancel", endPointer);
  board.addEventListener("pointerleave", endPointer);

  board.addEventListener("click", (event) => {
    if (moved) { event.stopPropagation(); event.preventDefault(); moved = false; }
  }, true);

  // Existing in-page zoom buttons — now zoom around the visible board centre.
  const zoomInBtn    = document.querySelector("#student-zoom-in");
  const zoomOutBtn   = document.querySelector("#student-zoom-out");
  const zoomResetBtn = document.querySelector("#student-zoom-reset");
  if (zoomInBtn)    zoomInBtn.addEventListener("click", () => zoomAtVisibleCenter(ZOOM_STEP));
  if (zoomOutBtn)   zoomOutBtn.addEventListener("click", () => zoomAtVisibleCenter(1 / ZOOM_STEP));
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => {
    state.view = { scale: 1, x: 0, y: 0 };
    state.applyView();
  });

  window.addEventListener("resize", () => refreshDotFontSizes(), { passive: true });
}

// Adds +/- buttons beside #back-to-top (mobile) and #back-to-top-desktop.
// Fully defensive: never throws, never touches the map containers.
// The map must always render regardless of this cosmetic step.
function bindZoomControlsNearTop() {
  try {
    const zoomAtCenter = state.zoomAtVisibleCenter;
    if (typeof zoomAtCenter !== "function") return;

    const anchors = [
      document.querySelector("#back-to-top"),
      document.querySelector("#back-to-top-desktop"),
    ].filter(Boolean);
    if (!anchors.length) return;

    // Refuse to inject inside the map surface itself.
    const forbidden = new Set([
      document.querySelector("#student-board"),
      document.querySelector("#student-maps"),
    ].filter(Boolean));

    const bars = [...new Set(
      anchors.map((a) => a.parentNode).filter((p) => p && !forbidden.has(p))
    )];
    if (!bars.length) return;

    const mkBtn = (label, aria) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.setAttribute("aria-label", aria);
      btn.title = aria;
      Object.assign(btn.style, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "36px",
        height: "36px",
        minWidth: "36px",
        flex: "0 0 auto",
        padding: "0",
        margin: "0 6px",
        borderRadius: "6px",
        border: "1px solid rgba(255,255,255,0.25)",
        background: "rgba(255,255,255,0.08)",
        color: "inherit",
        fontSize: "18px",
        fontWeight: "700",
        lineHeight: "1",
        cursor: "pointer",
        userSelect: "none",
      });
      return btn;
    };

    for (const bar of bars) {
      const anchor  = anchors.find((a) => a.parentNode === bar);
      const zoomIn  = mkBtn("+", "Zoom in");
      const zoomOut = mkBtn("-", "Zoom out");   // ASCII hyphen — no encoding risk
      zoomIn.addEventListener("click",  () => zoomAtCenter(ZOOM_STEP));
      zoomOut.addEventListener("click", () => zoomAtCenter(1 / ZOOM_STEP));
      if (anchor) {
        bar.insertBefore(zoomOut, anchor);
        bar.insertBefore(zoomIn, zoomOut);
      } else {
        bar.append(zoomIn, zoomOut);
      }
    }
  } catch (e) {
    // Zoom buttons are cosmetic — never let them break the page.
    console.warn("[student-play] Could not add zoom buttons:", e);
  }
}

function refreshDotFontSizes() {
  const dots = document.querySelectorAll("#student-maps .cell-team-dot, #student-maps .cell-spawn-dot");
  for (const dot of dots) {
    const cell = dot.parentElement;
    if (!cell) continue;
    const cellSize = Math.min(cell.clientWidth, cell.clientHeight);
    if (!cellSize) continue;
    const visual = cellSize * state.view.scale;
    const isSpawn = dot.classList.contains("cell-spawn-dot");
    const pct = isSpawn ? SPAWN_DIAMETER_PCT : DOT_DIAMETER_PCT;
    const diameter = visual * (pct / 100);
    const ratio = isSpawn ? 0.62 : 0.55;
    const fontPx = clamp(diameter * ratio, 6, 36);
    dot.style.fontSize = `${fontPx}px`;
    dot.style.letterSpacing = fontPx > 10 ? "0.5px" : "0";
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── Render ───────────────────────────────────────────────
function playMaps(contest) {
  return contestMapIds(contest).map((id) => state.maps.find((map) => map.id === id)).filter(Boolean);
}

function render() {
  const contest = state.contest;
  const maps = playMaps(contest);
  const map = maps[0] || null;
  const team = teamForUser(contest);
  const phase = contestPhase(contest);
  const frozen = isFrozen(contest, maps);
  state.phase = phase;
  state.frozen = frozen;

  document.querySelector("#student-play-title").textContent = contest.name;
  document.querySelector("#student-joined").hidden = false;
  document.querySelector("#student-joined").textContent = `Team ${team.name}. You are ${getSession()?.user?.username}.`;

  const board = buildLeaderboard(contest, map);
  const row = board.find((b) => b.teamId === team.id);
  const rank = board.findIndex((b) => b.teamId === team.id);
  const ownedCells = (contest.spawnResolved && (contest.spawns || []).some((s) => s.teamId === team.id) ? 1 : 0)
    + (contest.claims || []).filter((c) => c.teamId === team.id).length;
  const summary = document.querySelector("#student-team-summary");
  summary.hidden = false;
  summary.textContent = `Members: ${team.members.join(", ")} · Score: ${row?.score ?? 0} · Territory: ${ownedCells} cell${ownedCells === 1 ? "" : "s"} · Rank ${rank < 0 ? "—" : rank + 1} of ${board.length}.`;
  paintEnergy();

  writeStatus(contest, phase, map, frozen);
  renderRoster(contest, map, phase);
  renderLeaderboard(board);
  const showScores = phase === "live" || phase === "ended" || frozen;
  document.querySelector("#student-leaderboard").hidden = !showScores;
  document.querySelector("#student-leaderboard-heading").hidden = !showScores;
  document.querySelector("#student-board").hidden = maps.length === 0;

  if (!map) {
    document.querySelector("#spawn-agreement").hidden = true;
    paintClock();
    return;
  }
  renderMaps(contest, maps, phase, frozen, team);
  renderSpawnAgreement(contest, map, phase);
  paintClock();

  state.applyView?.();
  requestAnimationFrame(() => refreshDotFontSizes());
}

function writeStatus(contest, phase, map, frozen) {
  const mapBit = map ? `${map.name} · ${map.cols} × ${map.rows}` : "The map for this contest has been removed.";
  const team = teamForUser(contest);
  const score = buildLeaderboard(contest, map).find((r) => r.teamId === team?.id);
  const scoreBit = score ? ` ${team.name} has ${score.score} point${score.score === 1 ? "" : "s"}.` : "";
  document.querySelector("#student-play-meta").textContent = `${mapBit}. ${phaseSentence(contest, phase, frozen)}${scoreBit}`;
  const note = document.querySelector("#student-spawn-note");
  if (!map) { note.hidden = true; return; }
  note.hidden = false;
  const finalSpawn = contest.spawnResolved ? (contest.spawns || []).find((s) => s.teamId === team?.id) : null;
  if (finalSpawn && map.cells[finalSpawn.cell]?.kind === "spawnpoint") {
    note.textContent = `Your team starts at row ${Math.floor(finalSpawn.cell / map.cols) + 1}, column ${(finalSpawn.cell % map.cols) + 1}.`;
    return;
  }
  if (phase === "spawn" && !contest.spawnResolved) {
    const count = (map.cells || []).filter((c) => c.kind === "spawnpoint").length;
    note.textContent = count > 0 ? "Click the spawn point you want. It becomes your team's choice when every member picks that cell." : "This map has no spawn points.";
    return;
  }
  if (phase === "before") {
    note.textContent = contest.spawnMode === "random"
      ? "The map is visible. Your team will be placed on a random spawn point when the wait starts."
      : "The map is visible. Spawning has not started.";
    return;
  }
  note.textContent = "Your team does not have a spawn point.";
}

function renderRoster(contest, map, phase) {
  const roster = document.querySelector("#team-roster");
  const body = document.querySelector("#team-roster-body");
  if (!roster || !body) return;
  const team = teamForUser(contest);
  const show = Boolean(team && map) && (phase === "ready" || (phase === "spawn" && contest.spawnResolved));
  roster.hidden = !show;
  if (!show) return;
  body.replaceChildren();
  const row = document.createElement("tr");
  const name = document.createElement("td");
  const dot = el("span", "team-color-dot");
  dot.style.setProperty("--team", teamColor(contest, team.id));
  name.append(dot, document.createTextNode(team.name));
  const members = el("td", "team-members-cell");
  for (const m of team.members || []) members.append(el("span", "team-member-chip", m));
  const spawn = document.createElement("td");
  const spawnCell = (contest.spawns || []).find((s) => s.teamId === team.id);
  spawn.textContent = spawnCell && map.cells[spawnCell.cell]?.kind === "spawnpoint"
    ? `row ${Math.floor(spawnCell.cell / map.cols) + 1}, column ${(spawnCell.cell % map.cols) + 1}`
    : "No spawn point";
  row.append(name, members, spawn);
  body.append(row);
}

function renderLeaderboard(rows) {
  const list = document.querySelector("#student-leaderboard");
  renderList(list, rows, (row) => {
    const item = el("li", "leaderboard-row");
    const idx = rows.indexOf(row) + 1;
    item.append(
      el("span", "leaderboard-rank", `${idx}.`),
      el("span", "leaderboard-team", row.name),
      el("span", "leaderboard-stat", `${row.score} point${row.score === 1 ? "" : "s"}`),
      el("span", "leaderboard-stat", `${row.solved} solved`),
      el("span", "leaderboard-stat", `${row.territory} cell${row.territory === 1 ? "" : "s"}`)
    );
    return item;
  });
}

function buildLeaderboard(contest, map) {
  const spawns = contest.spawnResolved ? (contest.spawns || []) : [];
  return (contest.teams || []).map((team) => {
    let score = 0, solved = 0;
    let territory = spawns.some((s) => s.teamId === team.id) ? 1 : 0;
    for (const claim of contest.claims || []) {
      if (claim.teamId !== team.id) continue;
      territory += 1;
      const boardMap = playMaps(contest).find((item) => item.id === (claim.mapId || primaryMapId(contest)));
      const boardCell = boardMap?.cells?.[claim.cell];
      if (!boardCell || boardCell.kind !== "problem") continue;
      const p = state.problems.find((x) => x.index === boardCell.problemNo && x.type === boardCell.type);
      score += problemScore(p);
      solved += 1;
    }
    return { teamId: team.id, name: team.name, score, solved, territory };
  }).sort((a, b) => b.score - a.score || b.solved - a.solved || a.name.localeCompare(b.name));
}

function isFrozen(contest, maps) {
  const list = Array.isArray(maps) ? maps : [maps].filter(Boolean);
  if (!contest || !list.length) return contestPhase(contest) === "ended";
  if (contestPhase(contest) === "ended") return true;
  let problems = 0;
  for (const map of list) {
    for (let index = 0; index < (map.cells || []).length; index += 1) {
      if (map.cells[index]?.kind !== "problem") continue;
      problems += 1;
      const held = (contest.claims || []).some((claim) => (claim.mapId || primaryMapId(contest)) === map.id && claim.cell === index);
      if (!held) return false;
    }
  }
  return problems > 0;
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbToCss({ r, g, b }) {
  return `rgb(${r}, ${g}, ${b})`;
}

function renderMaps(contest, maps, phase, frozen, team) {
  const host = document.querySelector("#student-maps");
  if (!host) return;
  host.replaceChildren();
  for (const map of maps) {
    const block = el("section", "contest-map-block");
    if (maps.length > 1) block.append(el("h3", null, map.name));
    const scroll = el("div", "grid-scroll");
    const grid = el("div", "editor-grid");
    scroll.append(grid);
    block.append(scroll);
    host.append(block);
    renderGrid(contest, map, phase, frozen, team, grid);
  }
  drawTeleportLinks(host, contest.teleports);
}

function renderGrid(contest, map, phase, frozen, team, grid = document.querySelector("#student-maps")) {
  if (!grid) return;
  grid.dataset.cols = String(map.cols);
  grid.dataset.rows = String(map.rows);
  layoutMapGrid(grid, map.cols, map.rows);
  grid.style.gap = "0";
  grid.style.borderSpacing = "0";
  grid.replaceChildren();

  const style = document.createElement("style");
  style.textContent = `
#student-maps .student-cell.obstacle-cell {
  background: rgb(58, 58, 58) !important;
  background-image: none !important;
  border: 0 !important;
  box-shadow: none !important;
}
#student-maps .student-cell.obstacle-cell::before,
#student-maps .student-cell.obstacle-cell::after {
  content: none !important;
  background: none !important;
}
#student-maps .student-cell.cell-occupied::before,
#student-maps .student-cell.cell-occupied::after {
  content: none !important;
}
#student-maps .cell-team-dot,
#student-maps .cell-spawn-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* Claimed spawn dot: pulsing ring so it stays obviously a spawn. */
#student-maps .cell-spawn-dot {
  animation: spawn-pulse 1.8s ease-in-out infinite;
}

@keyframes spawn-pulse {
  0%, 100% {
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.95),
      0 0 0 7px rgba(183, 250, 0, 0.55),
      0 0 18px 6px rgba(183, 250, 0, 0.45);
  }
  50% {
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.95),
      0 0 0 10px rgba(183, 250, 0, 0.35),
      0 0 26px 10px rgba(183, 250, 0, 0.25);
  }
}
`;
  grid.append(style);

  const choosing = phase === "spawn" && !contest.spawnResolved && contest.spawnMode !== "random";

  map.cells.forEach((cell, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(index);
    button.dataset.map = map.id;

    const claim = (contest.claims || []).find((c) => (c.mapId || primaryMapId(contest)) === map.id && c.cell === index);
    const owner = ownerAt(contest, map.id, index, cell);
    const isSpawnCell = cell.kind === "spawnpoint";

    button.className = cellClassName(cell, findProblem, "grid-cell", "student-cell");

    let rgb;
    if (cell.kind === "problem") {
      const prob = findProblem(cell.problemNo, cell.type);
      const tier = TIER_VALUE[problemDifficulty(prob)] ?? null;
      rgb = tier != null ? GREEN_ANCHOR[tier] : OTHER_COLOURS.unknown;
    } else if (cell.kind === "obstacle")   rgb = OTHER_COLOURS.obstacle;
    else if (cell.kind === "spawnpoint")   rgb = OTHER_COLOURS.spawnpoint;
    else if (cell.kind === "teleport")     rgb = OTHER_COLOURS.teleport;
    else                                   rgb = OTHER_COLOURS.empty;

    if (!owner && cell.kind !== "obstacle") rgb = mix(rgb, OTHER_COLOURS.empty, 0.35);

    button.style.background = rgbToCss(rgb);
    button.style.backgroundImage = "none";
    button.style.color = "#ffffff";
    button.style.textShadow = "0 1px 2px rgba(0,0,0,0.55)";
    button.style.margin = "0";
    button.style.border = "0";
    button.style.borderRadius = "0";
    button.style.boxShadow = "none";
    button.style.position = "relative";

    if (cell.kind === "obstacle") button.classList.add("obstacle-cell");

    if (owner && isSpawnCell) {
      // ── Claimed spawn: large pulsing team dot, no SPAWN text ──
      button.classList.add(owner.id === team.id ? "owned" : "taken");
      button.classList.add(owner.id === team.id ? "mine" : "rival");
      button.classList.add("cell-occupied");
      button.classList.add("spawn-cell");
      button.style.setProperty("--team", teamColor(contest, owner.id));
      button.textContent = "";

      const dot = el("span", "cell-spawn-dot cell-team-dot");
      dot.style.position = "absolute";
      dot.style.top = "50%";
      dot.style.left = "50%";
      dot.style.transform = "translate(-50%, -50%)";
      dot.style.width = `${SPAWN_DIAMETER_PCT}%`;
      dot.style.height = `${SPAWN_DIAMETER_PCT}%`;
      dot.style.borderRadius = "50%";
      dot.style.background = teamColor(contest, owner.id);
      dot.style.border = owner.id === team.id
        ? "2px solid rgba(255,255,255,0.95)"
        : "1.5px solid rgba(255,255,255,0.7)";
      dot.style.boxSizing = "border-box";
      dot.style.fontFamily = '"Share Tech Mono", monospace';
      dot.style.fontWeight = "700";
      dot.style.lineHeight = "1";
      dot.style.color = "#ffffff";
      dot.style.textShadow = "0 1px 2px rgba(0,0,0,0.6)";
      dot.style.pointerEvents = "none";
      dot.style.overflow = "hidden";
      dot.textContent = teamShort(owner.name).slice(0, 3).toUpperCase();
      dot.title = owner.name;
      button.append(dot);

      button.style.filter = owner.id === team.id ? "brightness(1.0)" : "brightness(0.85)";
      button.disabled = true;
    } else if (owner) {
      // ── Claimed non-spawn: normal team dot ─────────────
      button.classList.add(owner.id === team.id ? "owned" : "taken");
      button.classList.add(owner.id === team.id ? "mine" : "rival");
      button.classList.add("cell-occupied");
      button.style.setProperty("--team", teamColor(contest, owner.id));
      button.textContent = "";

      const dot = el("span", "cell-team-dot");
      dot.style.position = "absolute";
      dot.style.top = "50%";
      dot.style.left = "50%";
      dot.style.transform = "translate(-50%, -50%)";
      dot.style.width = `${DOT_DIAMETER_PCT}%`;
      dot.style.height = `${DOT_DIAMETER_PCT}%`;
      dot.style.borderRadius = "50%";
      dot.style.background = teamColor(contest, owner.id);
      dot.style.border = owner.id === team.id
        ? "2px solid rgba(255,255,255,0.95)"
        : "1.5px solid rgba(255,255,255,0.7)";
      dot.style.display = "flex";
      dot.style.alignItems = "center";
      dot.style.justifyContent = "center";
      dot.style.boxSizing = "border-box";
      dot.style.fontFamily = '"Share Tech Mono", monospace';
      dot.style.fontWeight = "700";
      dot.style.lineHeight = "1";
      dot.style.color = "#ffffff";
      dot.style.textShadow = "0 1px 2px rgba(0,0,0,0.6)";
      dot.style.pointerEvents = "none";
      dot.style.overflow = "hidden";
      dot.textContent = teamShort(owner.name).slice(0, 3).toUpperCase();
      dot.title = owner.name;
      button.append(dot);

      button.style.filter = owner.id === team.id ? "brightness(1.0)" : "brightness(0.85)";
      button.disabled = true;
    } else if (isSpawnCell) {
      // ── Unclaimed spawn: plain dim cell, no dot / no highlight ──
      button.textContent = "";
      button.disabled = !choosing;
      if (choosing) {
        const myVote = (contest.spawnVotes || []).find((v) => v.teamId === team.id && sameContestant(v.username, getSession()?.user?.username));
        if (myVote && myVote.mapId === map.id && myVote.cell === index) button.classList.add("mine");
      }
    } else {
      const paired = cell.kind === "teleport" && teleportPairAt(contest, map.id, index);
      const reachable = phase === "live" && !frozen && !claim && adjacentToTeam(map, contest, team.id, index)
        && (cell.kind === "problem" || (cell.kind === "teleport" && paired));
      button.disabled = !reachable;
      if (cell.kind === "teleport") button.textContent = teleportLabel(contest, map.id, index) || "T";
      else button.textContent = mapBackdrop(map) === "photo" || cell.kind === "problem" ? "" : cellText(cell);
    }
    if (cell.kind === "teleport" && owner) {
      const mark = el("span", "cell-label");
      mark.textContent = teleportLabel(contest, map.id, index) || "T";
      button.append(mark);
    }

    if (state.selectedCell === index && state.selectedMapId === map.id) button.setAttribute("aria-pressed", "true");
    const place = cellLabel(cell, Math.floor(index / map.cols) + 1, (index % map.cols) + 1);
    button.setAttribute("aria-label", owner && owner.id !== team.id ? `${place}, occupied by ${owner.name}` : place);
    grid.append(button);
  });
  paintPhotoGrid(grid, map, findProblem);
}

function showCellTip(event) {
  const tip = document.querySelector("#cell-tooltip");
  const button = event.target.closest?.(".grid-cell");
  if (!tip || !button) return;
  const contest = state.contest;
  const map = state.maps.find((m) => m.id === (button.dataset.map || contest?.mapId));
  const index = Number(button.dataset.index);
  const cell = map?.cells?.[index];
  if (!map || !cell) { tip.hidden = true; return; }
  tip.replaceChildren(...cellTipLines(contest, map, index, cell).map((line) => el("p", "", line)));
  tip.hidden = false;
  const pad = 14;
  tip.style.left = "0px";
  tip.style.top = "0px";
  const box = tip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - pad;
  if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function cellTipLines(contest, map, index, cell) {
  const row = Math.floor(index / map.cols) + 1;
  const column = (index % map.cols) + 1;
  const lines = [`Row ${row}, column ${column}`];
  if (cell.kind === "problem") {
    const problem = findProblem(cell.problemNo, cell.type);
    const difficulty = problemDifficulty(problem);
    const points = problemScore(problem);
    lines.push(`${problemTag(cell.problemNo, cell.type)} · ${DIFFICULTY_NAME[difficulty] || "Normal"} · ${points} point${points === 1 ? "" : "s"}`);
  } else if (cell.kind === "obstacle") lines.push("Obstacle");
  else if (cell.kind === "spawnpoint") lines.push("Spawn point");
  else if (cell.kind === "teleport") {
    const label = teleportLabel(contest, map.id, index);
    lines.push(label ? `Teleport ${label}` : "Teleport, not connected");
  } else lines.push("Empty");
  const claim = (contest.claims || []).find((c) => (c.mapId || primaryMapId(contest)) === map.id && c.cell === index);
  if (claim) {
    const team = (contest.teams || []).find((t) => t.id === claim.teamId);
    const when = claim.solvedAt ? formatContestTime(claim.solvedAt) : "";
    const who = claim.solvedBy ? ` · ${claim.solvedBy}` : "";
    lines.push(`Occupied by ${team?.name || "a team"}${who}${when ? ` at ${when}` : ""}`);
  } else if (cell.kind === "spawnpoint" && contest.spawnResolved) {
    const spawn = (contest.spawns || []).find((s) => (s.mapId || primaryMapId(contest)) === map.id && s.cell === index);
    const team = spawn ? (contest.teams || []).find((t) => t.id === spawn.teamId) : null;
    if (team) lines.push(`Held by ${team.name}`);
  }
  return lines;
}

function findProblem(index, type) {
  return state.problems.find((p) => p.index === index && p.type === type) || null;
}

function ownerAt(contest, mapId, index, cell) {
  const claim = (contest.claims || []).find((c) => (c.mapId || primaryMapId(contest)) === mapId && c.cell === index);
  if (claim) return (contest.teams || []).find((t) => t.id === claim.teamId) || null;
  if (cell?.kind !== "spawnpoint" || !contest.spawnResolved) return null;
  const spawn = (contest.spawns || []).find((s) => (s.mapId || primaryMapId(contest)) === mapId && s.cell === index);
  return spawn ? (contest.teams || []).find((t) => t.id === spawn.teamId) || null : null;
}

function adjacentToTeam(map, contest, teamId, cell) {
  if (!teamId || !map || !Number.isInteger(cell)) return false;
  const owned = new Set();
  if (contest.spawnResolved) {
    for (const s of contest.spawns || []) {
      if (s.teamId === teamId && (s.mapId || primaryMapId(contest)) === map.id) owned.add(s.cell);
    }
  }
  for (const c of contest.claims || []) {
    if (c.teamId === teamId && (c.mapId || primaryMapId(contest)) === map.id) owned.add(c.cell);
  }
  const row = Math.floor(cell / map.cols);
  const col = cell % map.cols;
  const neighbors = [];
  if (col > 0) neighbors.push(cell - 1);
  if (col + 1 < map.cols) neighbors.push(cell + 1);
  if (row > 0) neighbors.push(cell - map.cols);
  if (row + 1 < map.rows) neighbors.push(cell + map.cols);
  return neighbors.some((i) => owned.has(i));
}

function renderSpawnAgreement(contest, map, phase) {
  const wrap = document.querySelector("#spawn-agreement");
  const body = document.querySelector("#spawn-votes");
  const team = teamForUser(contest);
  const open = Boolean(team && map && phase === "spawn" && !contest.spawnResolved);
  wrap.hidden = !open;
  if (!open) return;
  body.replaceChildren();
  const me = getSession()?.user?.username;
  for (const member of team.members) {
    const vote = (contest.spawnVotes || []).find((v) => v.teamId === team.id && sameContestant(v.username, member));
    const voteMap = vote ? state.maps.find((item) => item.id === (vote.mapId || map.id)) || map : map;
    const row = document.createElement("tr");
    row.append(el("td", null, sameContestant(member, me) ? `${member} (you)` : member));
    row.append(el("td", null, vote && voteMap ? `${voteMap.name} · row ${Math.floor(vote.cell / voteMap.cols) + 1}, column ${(vote.cell % voteMap.cols) + 1}` : "Waiting"));
    const status = el("td", "member-status");
    const icon = el("i", vote ? "fa-solid fa-circle-check vote-yes" : "fa-solid fa-circle-question vote-no");
    icon.setAttribute("aria-label", vote ? "Voted" : "Not voted yet");
    status.append(icon);
    row.append(status);
    body.append(row);
  }
  const agreed = (contest.spawnChoices || []).find((c) => c.teamId === team.id);
  const currentCell = Number.isInteger(agreed?.cell) ? agreed.cell : null;
  const key = `${contest.id}:${team.id}`;
  const prev = state.spawnCache.get(key);
  if (prev !== undefined && prev !== currentCell) {
    showPageToast(currentCell === null ? "Not all team members have chosen the same spawn point yet." : `Spawn point: row ${Math.floor(currentCell / map.cols) + 1}, column ${(currentCell % map.cols) + 1}`, currentCell === null ? "warn" : "ok");
  }
  state.spawnCache.set(key, currentCell);
  document.querySelector("#spawn-agreement-note").textContent = agreed
    ? `Spawn point: row ${Math.floor(agreed.cell / map.cols) + 1}, column ${(agreed.cell % map.cols) + 1}`
    : "Spawn point: not agreed yet. Every team member must choose the same cell.";
}

async function onGridClick(event) {
  const button = event.target.closest("[data-index]");
  if (!button || button.disabled) return;
  const contest = state.contest;
  const map = state.maps.find((m) => m.id === (button.dataset.map || primaryMapId(contest)));
  const team = teamForUser(contest);
  if (!map || !team) return;
  const index = Number(button.dataset.index);
  const cell = map.cells[index];
  const phase = contestPhase(contest);
  const maps = playMaps(contest);

  if (cell?.kind === "spawnpoint" && phase === "spawn" && !contest.spawnResolved && contest.spawnMode !== "random") {
    await chooseSpawn(contest, map.id, index);
    return;
  }
  if (cell?.kind === "teleport" && phase === "live" && !isFrozen(contest, maps)) {
    await claimTeleport(contest, map.id, index);
    return;
  }
  if (cell?.kind === "problem" && phase === "live" && !isFrozen(contest, maps)) {
    const claim = (contest.claims || []).some((c) => (c.mapId || primaryMapId(contest)) === map.id && c.cell === index);
    if (claim || !adjacentToTeam(map, contest, team.id, index)) return;
    if (answerOpenMode() === "newtab") {
      const url = new URL("/answer.html", location.origin);
      url.searchParams.set("contest", contest.id);
      url.searchParams.set("map", map.id);
      url.searchParams.set("cell", String(index));
      window.open(url.href, "_blank", "noopener");
      return;
    }
    state.selectedCell = index;
    state.selectedMapId = map.id;
    render();
    showProblem(contest, map, phase);
  }
}

let promptRequest = 0;

async function showProblem(contest, map, phase) {
  const team = teamForUser(contest);
  const cell = map.cells[state.selectedCell];
  const claim = (contest.claims || []).find((c) => (c.mapId || primaryMapId(contest)) === map.id && c.cell === state.selectedCell);
  const playable = phase === "live" && !isFrozen(contest, playMaps(contest)) && cell?.kind === "problem" && !claim && adjacentToTeam(map, contest, team.id, state.selectedCell);
  const panel = document.querySelector("#student-problem");
  const form = document.querySelector("#student-answer-form");
  if (!playable) { panel.hidden = true; form.hidden = true; return; }

  const problem = findProblem(cell.problemNo, cell.type);
  const request = ++promptRequest;
  const openMapId = map.id;
  const openCell = state.selectedCell;
  panel.hidden = false;
  const d = problemDifficulty(problem);
  const pts = problemScore(problem);
  const tag = document.querySelector("#student-problem-tag");
  tag.textContent = `${DIFFICULTY_NAME[d] || "Normal"} · ${pts} point${pts === 1 ? "" : "s"}`;
  form.hidden = false;
  paintEnergy();
  document.querySelector("#student-answer-error").hidden = true;
  document.querySelector("#student-answer-success").hidden = true;
  const input = document.querySelector("#student-answer");
  input.style.cssText = "";
  input.readOnly = false;
  let prompt = problem?.prompt?.trim() ? problem.prompt : "";
  if (!prompt) {
    statement.render("Loading...", tag.textContent);
    try {
      const data = await loadPage("page-answer", { contest: contest.id, map: openMapId, cell: openCell });
      if (request !== promptRequest || state.selectedMapId !== openMapId || state.selectedCell !== openCell) return;
      prompt = data.problem?.prompt?.trim() ? data.problem.prompt : "";
      if (problem) problem.prompt = data.problem?.prompt || "";
    } catch (err) {
      if (request !== promptRequest) return;
      panel.hidden = true;
      form.hidden = true;
      showPageToast(err.message || "The problem could not be opened.", "warn");
      return;
    }
  }
  if (request !== promptRequest) return;
  statement.render(prompt || "This problem has no text yet.", tag.textContent);
  if (!input.readOnly) input.focus();
}

function closeProblem() {
  promptRequest += 1;
  const panel = document.querySelector("#student-problem");
  if (panel.hidden) return;
  state.selectedCell = null;
  state.selectedMapId = "";
  panel.hidden = true;
  document.querySelector("#student-answer-form").hidden = true;
  document.querySelector("#student-answer-success").hidden = true;
  for (const b of document.querySelectorAll("#student-maps [aria-pressed='true']")) b.removeAttribute("aria-pressed");
}

async function chooseSpawn(contest, mapId, cell) {
  const team = teamForUser(contest);
  if (!team) return;
  const username = getSession()?.user?.username;
  const prevVotes = (contest.spawnVotes || []).slice();
  const prevChoices = (contest.spawnChoices || []).slice();
  contest.spawnVotes = prevVotes.filter((v) => !(v.teamId === team.id && sameContestant(v.username, username)));
  contest.spawnVotes.push({ teamId: team.id, username, mapId, cell });
  contest.spawnChoices = agreedSpawnChoices(contest);
  render();
  try {
    const data = await api.chooseSpawn(contest.id, cell, mapId);
    applyPlayState(data);
    const finalSpawn = (contest.spawns || []).find((s) => s.teamId === team.id);
    const agreed = (contest.spawnChoices || []).find((c) => c.teamId === team.id);
    const chosenPlace = finalSpawn || agreed;
    const map = state.maps.find((m) => m.id === (chosenPlace?.mapId || mapId));
    const chosen = chosenPlace?.cell;
    if (map && Number.isInteger(chosen)) {
      showPageToast(`Spawn point: row ${Math.floor(chosen / map.cols) + 1}, column ${(chosen % map.cols) + 1}`, "ok");
    } else {
      showPageToast("Not all team members have chosen the same spawn point yet.", "warn");
    }
  } catch (err) {
    contest.spawnVotes = prevVotes;
    contest.spawnChoices = prevChoices;
    showPageToast(err.message, "warn");
  }
  render();
}

async function claimTeleport(contest, mapId, cell) {
  try {
    const data = await api.claimTeleport(contest.id, mapId, cell);
    applyPlayState(data);
    render();
  } catch (err) {
    if (err.data?.contest) applyPlayState(err.data);
    showPageToast(err.message || "That teleport could not be used.", "warn");
    render();
  }
}

async function submitAnswer(event) {
  event.preventDefault();
  const contest = state.contest;
  const map = state.maps.find((m) => m.id === (state.selectedMapId || primaryMapId(contest)));
  const team = teamForUser(contest);
  if (!contest || !map || !team || state.selectedCell === null) return;
  const cell = state.selectedCell;
  const submit = document.querySelector("#student-answer-form button");
  const settings = readEnergySettings(contest);
  const energy = teamEnergy(contest, team.id);
  if (energy < settings.attemptMin) {
    const errorEl = document.querySelector("#student-answer-error");
    errorEl.hidden = false;
    errorEl.textContent = `The team has ${energy} energy. An attempt needs at least ${settings.attemptMin}.`;
    return;
  }
  if (submit.disabled) return;
  const label = submit.textContent;
  submit.dataset.busy = "1";
  submit.disabled = true; submit.textContent = "Checking...";
  const errorEl = document.querySelector("#student-answer-error");
  errorEl.hidden = true;

  const approval = await statement.approveSubmit();
  if (approval.blocked) {
    submit.dataset.busy = "";
    submit.disabled = false; submit.textContent = label;
    errorEl.hidden = false;
    errorEl.textContent = approval.message || "Finish the problem before submitting.";
    return;
  }

  const prevClaims = (contest.claims || []).slice();
  const pending = { cell, teamId: team.id, solvedBy: getSession()?.user?.username, solvedAt: Date.now(), pending: true };
  contest.claims = prevClaims.filter((c) => c.cell !== cell).concat(pending);
  render();

  let failure = "";
  try {
    const data = await api.solve(contest.id, cell, document.querySelector("#student-answer").value, map.id);
    applyPlayState(data);
    publishContestPatch(contest.id, data.contest, data.serverNow);
    document.querySelector("#student-answer").value = "";
    document.querySelector("#student-answer-form").hidden = true;
    const success = document.querySelector("#student-answer-success");
    success.hidden = false;
    success.textContent = "Answer accepted. Close this problem to continue.";

    // ── SHOW POP-UP ON SUCCESS ──────────────────────────────────────
    var overlay = document.createElement("div");
    overlay.setAttribute("style",
      "position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.85);" +
      "display:flex;align-items:center;justify-content:center;" +
      "padding:12px;box-sizing:border-box;"
    );

    overlay.innerHTML =
      '<div style="position:relative;background:#081220;border:2px solid #3ee0ff;' +
        'border-radius:6px;padding:12px;box-shadow:0 0 24px rgba(62,224,255,0.35);' +
        'max-width:100%;max-height:100%;display:flex;flex-direction:column;' +
        'align-items:center;box-sizing:border-box;">' +

        '<button type="button" aria-label="Close" data-neko-close ' +
          'style="align-self:flex-end;margin:0 0 8px 0;min-width:44px;min-height:44px;' +
          'border:1px solid #3ee0ff;border-radius:4px;background:rgba(62,224,255,0.14);' +
          'color:#3ee0ff;font-size:22px;line-height:1;cursor:pointer;padding:0;">×</button>' +

        '<div data-neko-status style="color:#d7f6ff;font-size:14px;padding:8px;">Loading…</div>' +
        '<h2 style="color:lime">ACCEPTED!</h2>' +
        '<img data-neko-img alt="" ' +
          'style="max-width:100%;max-height:70vh;width:auto;height:auto;' +
          'display:none;border-radius:4px;">' +

      '</div>';

    function closeOverlay() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      closeProblem();
    }
    overlay.querySelector("[data-neko-close]").addEventListener("click", closeOverlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeOverlay();
    });

    document.body.appendChild(overlay);

    // Helper to get cookie
    function getCookie(name) {
      var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      if (match) return match[2];
      return null;
    }

    var img = overlay.querySelector("[data-neko-img]");
    var statusEl = overlay.querySelector("[data-neko-status]");

    // If neko cookie is set to 1, try to fetch neko. Otherwise, fallback immediately.
    if (getCookie("neko") === "1") {
      fetch("https://nekos.best/api/v2/neko")
        .then(function (r) { return r.json(); })
        .then(function (json) {
          var imgUrl = json.results && json.results[0] && json.results[0].url;
          if (!imgUrl) throw new Error("no image url");
          img.onload = function () {
            statusEl.style.display = "none";
            img.style.display = "block";
          };
          img.onerror = function () {
            statusEl.textContent = "Image failed to load.";
          };
          img.src = imgUrl;
        })
        .catch(function (e) {
          // Fallback if API fails
          statusEl.style.display = "none";
          img.onerror = function () { /* optionally show text if fallback also fails */ };
          img.src = "lol.png"; 
          img.style.display = "block";
        });
    } else {
      // Fallback directly if cookie is not 1
      statusEl.style.display = "none";
      img.src = "lol.png";
      img.style.display = "block";
    }
    // ────────────────────────────────────────────────────────────────

  } catch (err) {
    contest.claims = prevClaims;
    if (err.data?.contest) {
      applyPlayState(err.data);
      publishContestPatch(contest.id, err.data.contest, err.data.serverNow);
    }
    failure = err.message;
  }
  submit.dataset.busy = "";
  submit.disabled = false; submit.textContent = label;
  render();
  if (failure) {
    errorEl.hidden = false;
    errorEl.textContent = failure;
  }
}

function applyPlayState(data) {
  const next = data?.contest;
  if (!next) return;
  const c = state.contest;
  if (Array.isArray(next.teams)) { c.teams = normalizeTeams(next.teams); c.contestantIds = c.teams.flatMap((t) => t.members); }
  if (typeof next.spawnResolved === "boolean") c.spawnResolved = next.spawnResolved;
  if (next.mode) c.mode = next.mode;
  if (Array.isArray(next.resolvedTeams)) c.resolvedTeams = next.resolvedTeams;
  if (Array.isArray(next.spawnChoices)) c.spawnChoices = normalizeTeamCells(next.spawnChoices, primaryMapId(c));
  if (Array.isArray(next.spawnVotes)) c.spawnVotes = normalizeSpawnVotes(next.spawnVotes, primaryMapId(c));
  if (Array.isArray(next.spawns)) c.spawns = normalizeTeamCells(next.spawns, primaryMapId(c));
  if (Array.isArray(next.claims)) c.claims = normalizeClaims(next.claims, primaryMapId(c));
  if (typeof next.mapId === "string" && next.mapId) c.mapId = next.mapId;
  if (Array.isArray(next.mapIds)) c.mapIds = next.mapIds;
  if (Array.isArray(next.teleports)) c.teleports = next.teleports;
  if (Array.isArray(next.energy)) c.energy = next.energy;
  if (Number.isInteger(next.energyRegen)) c.energyRegen = next.energyRegen;
  if (Number.isInteger(next.energyRegenSeconds)) c.energyRegenSeconds = next.energyRegenSeconds;
  if (Number.isInteger(next.energyAttemptCost)) c.energyAttemptCost = next.energyAttemptCost;
  if (Number.isInteger(next.energyAttemptMin)) c.energyAttemptMin = next.energyAttemptMin;
  if (Number.isInteger(next.energySolveBelow)) c.energySolveBelow = next.energySolveBelow;
  if (next.energySolve) c.energySolve = next.energySolve;
  noteServerTime(data.serverNow);
}

function paintEnergy() {
  const contest = state.contest;
  const team = contest && teamForUser(contest);
  const node = document.querySelector("#student-energy");
  const track = document.querySelector("#student-energy-track");
  const fill = document.querySelector("#student-energy-fill");
  if (!contest || !team || !node || !track || !fill) return;
  const settings = readEnergySettings(contest);
  const value = teamEnergy(contest, team.id);
  node.hidden = false;
  track.hidden = false;
  node.textContent = value < settings.attemptMin
    ? `Energy ${value} / 100. An attempt needs at least ${settings.attemptMin}.`
    : `Energy ${value} / 100. Restores ${settings.regen} every ${settings.regenSeconds}s. Each attempt spends ${settings.attemptCost}.`;
  fill.style.width = `${value}%`;
  fill.classList.toggle("low", value < settings.attemptMin);
  const submit = document.querySelector("#student-answer-form button");
  const block = document.querySelector("#student-energy-block");
  const blocked = value < settings.attemptMin;
  if (submit && submit.dataset.busy !== "1") submit.disabled = blocked;
  if (block) {
    block.hidden = !blocked;
    block.textContent = `The team has ${value} energy. An attempt needs at least ${settings.attemptMin}.`;
  }
}

function paintClock() {
  const node = document.querySelector("#student-countdown");
  if (!node) return;
  const text = phaseClock(state.contest);
  node.hidden = !text;
  node.textContent = text;
}

function startClock() {
  if (state.clock) return;
  state.clock = setInterval(() => {
    if (!document.querySelector("#student-maps")) { clearInterval(state.clock); state.clock = null; return; }
    paintClock();
    paintEnergy();
    const phase = contestPhase(state.contest);
    const map = playMaps(state.contest)[0] || null;
    const frozen = isFrozen(state.contest, playMaps(state.contest));
    const sig = `${phase}:${frozen}:${state.contest.spawnResolved}`;
    if (sig !== `${state.phase}:${state.frozen}:${state.contest.spawnResolved}`) render();
    else writeStatus(state.contest, phase, map, frozen);
    syncContest().catch(() => {});
  }, 2000);
}

async function syncContest() {
  const now = Date.now();
  const gap = document.hidden ? 60000 : (now - state.lastMouse >= 5000 ? 20000 : 5000);
  if (now - state.syncAt < gap) return;
  state.syncAt = now;
  try {
    const data = await api.contestState(state.contest.id);
    applyPlayState(data);
    render();
  } catch {}
}

// ── 启动（最后） ─────────────────────────────────────────
if (requireContestant()) {
  initNav("contests");
  bindToastClose();
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message || "Could not open the contest."; }
  });
}