import { requireAdmin } from "../shared/session.js?v=roles";
import { api } from "../shared/api.js?v=poll-stamp";
import { noteServerTime, phaseClock } from "../shared/contest-time.js";
import { renderScoreGrid } from "../shared/score-grid.js?v=score-grid";

const contestId = new URLSearchParams(location.search).get("id") || "";
let contest = null;
let syncAt = 0;
let stamp = "";

function paintClock() {
  const node = document.querySelector("#scoreboard-phase");
  if (!node) return;
  node.textContent = contest ? phaseClock(contest) : "";
}

function paint(next) {
  contest = next;
  const title = document.querySelector("#scoreboard-title");
  const list = document.querySelector("#scoreboard-list");
  const empty = document.querySelector("#scoreboard-empty");
  const status = document.querySelector("#scoreboard-status");
  if (title) title.textContent = contest.name || "Contest";
  const rows = Array.isArray(contest.leaderboard) ? contest.leaderboard : [];
  if (empty) empty.hidden = rows.length > 0;
  if (list) list.hidden = rows.length === 0;
  if (status) status.textContent = "Live";
  renderScoreGrid(list, rows);
  paintClock();
}

async function pull() {
  const now = Date.now();
  const gap = document.hidden ? 30000 : 8000;
  if (now - syncAt < gap) return;
  syncAt = now;
  const error = document.querySelector("#scoreboard-error");
  const status = document.querySelector("#scoreboard-status");
  try {
    const data = await api.contestState(contestId, stamp);
    if (data.unchanged) {
      stamp = data.stamp || stamp;
      noteServerTime(data.serverNow);
      if (status && contest) status.textContent = "Live";
      return;
    }
    stamp = data.stamp || stamp;
    noteServerTime(data.serverNow);
    paint(data.contest);
    if (error) error.hidden = true;
  } catch (err) {
    if (status && contest) status.textContent = "Reconnecting";
    if (error && !contest) {
      error.hidden = false;
      error.textContent = err.message || "The scoreboard could not be opened.";
    }
  }
}

if (requireAdmin()) {
  const error = document.querySelector("#scoreboard-error");
  if (!contestId) {
    if (error) {
      error.hidden = false;
      error.textContent = "No contest selected.";
    }
  } else {
    pull();
    setInterval(paintClock, 1000);
    setInterval(() => { pull(); }, 1000);
  }
}
