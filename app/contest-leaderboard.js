import { requireContestant } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=account";
import { api } from "../shared/api.js?v=roles";
import { el } from "../shared/dom.js";
import { contestPhase, noteServerTime } from "../shared/contest-time.js";
import { pointsLabel } from "../shared/contest-data.js?v=leaderboard";

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
  const rows = hidden ? [] : (Array.isArray(contest.leaderboard) ? contest.leaderboard : []);
  if (note) {
    note.textContent = hidden
      ? "The leaderboard is hidden."
      : (ended
        ? "Final scores. Each scoring rule is listed in the order it is revealed."
        : "Each team’s total. The points from each rule appear after the contest ends.");
  }
  if (empty) empty.hidden = hidden || rows.length > 0;
  if (!list) return;
  list.hidden = rows.length === 0;
  list.replaceChildren();
  rows.forEach((row, index) => {
    const detailed = Array.isArray(row.rules) && row.rules.length > 0;
    const item = el("li", detailed ? "leaderboard-row leaderboard-detailed" : "leaderboard-row leaderboard-total");
    item.append(
      el("span", "leaderboard-rank", `${index + 1}.`),
      el("span", "leaderboard-team", row.name),
      el("span", "leaderboard-stat", pointsLabel(row.rankScore))
    );
    if (detailed) {
      const rules = el("ul", "leaderboard-rules");
      for (const rule of row.rules) rules.append(el("li", null, `${rule.label}: ${pointsLabel(rule.points)}`));
      item.append(rules);
    }
    list.append(item);
  });
}

async function pull() {
  const now = Date.now();
  const gap = document.hidden ? 15000 : 2000;
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
