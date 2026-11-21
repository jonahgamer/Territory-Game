import { requireContestant } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=account";
import { api } from "../shared/api.js?v=roles";
import { renderScoreGrid } from "../shared/score-grid.js?v=score-grid";
import { contestPhase, noteServerTime } from "../shared/contest-time.js";

const contestId = new URLSearchParams(location.search).get("contest") || "";
let syncAt = 0;

function paint(contest) {
  const title = document.querySelector("#leaderboard-title");
  const note = document.querySelector("#leaderboard-note");
  const empty = document.querySelector("#leaderboard-empty");
  const list = document.querySelector("#leaderboard-list");
  const back = document.querySelector("#back-to-contest");
  if (back) back.href = `/play.html?contest=${encodeURIComponent(contest.id || contestId)}`;
  if (title) title.textContent = contest.name || "Leaderboard";
  const hidden = contest.leaderboardHidden === true;
  const ended = contestPhase(contest) === "ended";
  let rows = hidden ? [] : (Array.isArray(contest.leaderboard) ? contest.leaderboard : []);
  if (!ended) {
    rows = rows.map((row) => ({ teamId: row.teamId, name: row.name, rankScore: row.rankScore }));
  }
  if (note) {
    note.textContent = hidden
      ? "The leaderboard is hidden."
      : (ended
        ? "Final scores. Columns follow the reveal order. Basic score plus the rule total is the final score."
        : "Each team’s final score. The rule columns appear after the contest ends.");
  }
  if (empty) empty.hidden = hidden || rows.length > 0;
  if (!list) return;
  list.hidden = rows.length === 0;
  renderScoreGrid(list, rows);
}

async function pull() {
  const now = Date.now();
  const gap = document.hidden ? 30000 : 8000;
  if (now - syncAt < gap) return;
  syncAt = now;
  const error = document.querySelector("#load-error");
  try {
    const data = await api.contestState(contestId);
    noteServerTime(data.serverNow);
    paint(data.contest);
    if (error) error.hidden = true;
  } catch (err) {
    if (error) {
      error.hidden = false;
      error.textContent = err.message || "The leaderboard could not be opened.";
    }
  }
}

if (requireContestant()) {
  initNav("contests");
  const back = document.querySelector("#back-to-contest");
  if (back && contestId) back.href = `/play.html?contest=${encodeURIComponent(contestId)}`;
  if (!contestId) {
    const error = document.querySelector("#load-error");
    if (error) {
      error.hidden = false;
      error.textContent = "No contest selected.";
    }
  } else {
    pull();
    setInterval(() => { pull(); }, 1000);
  }
}
