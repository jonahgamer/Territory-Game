import { requireAdmin } from "../shared/session.js?v=roles";
import { api } from "../shared/api.js?v=roles";
import { noteServerTime, phaseClock } from "../shared/contest-time.js";
import { teamColor, teamShort, pointsLabel } from "../shared/contest-data.js?v=leaderboard";
import { el } from "../shared/dom.js";

const contestId = new URLSearchParams(location.search).get("id") || "";
const previous = new Map();
let contest = null;
let syncAt = 0;

function scoreNumber(points) {
  const n = Math.round(Number(points) * 10) / 10;
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

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
  if (!list) return;
  list.replaceChildren();
  rows.forEach((row, index) => {
    const rank = index + 1;
    const before = previous.get(row.teamId);
    const item = el("li", "scoreboard-row");
    if (before && rank < before.rank) item.classList.add("rank-up");
    if (before && Number(row.rankScore) > Number(before.score)) item.classList.add("score-up");
    item.style.setProperty("--team", teamColor(contest, row.teamId));
    const place = el("span", "scoreboard-rank", String(rank));
    const team = el("span", "scoreboard-team");
    const mark = el("span", "scoreboard-mark", teamShort(row.name));
    team.append(mark, el("span", "scoreboard-name", row.name));
    const score = el("span", "scoreboard-score");
    score.append(el("strong", null, scoreNumber(row.rankScore)), el("span", null, "points"));
    const meta = el("span", "scoreboard-meta");
    meta.append(
      el("span", null, `${row.solved} solved`),
      el("span", null, `${row.territory} cell${row.territory === 1 ? "" : "s"}`)
    );
    item.append(place, team, score, meta);
    if (Array.isArray(row.rules) && row.rules.length) {
      const rules = el("ul", "scoreboard-rules");
      for (const rule of row.rules) rules.append(el("li", null, `${rule.label}: ${pointsLabel(rule.points)}`));
      item.append(rules);
    }
    list.append(item);
    previous.set(row.teamId, { rank, score: row.rankScore });
  });
  paintClock();
}

async function pull() {
  const now = Date.now();
  const gap = document.hidden ? 15000 : 2000;
  if (now - syncAt < gap) return;
  syncAt = now;
  const error = document.querySelector("#scoreboard-error");
  const status = document.querySelector("#scoreboard-status");
  try {
    const data = await api.contestState(contestId);
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
