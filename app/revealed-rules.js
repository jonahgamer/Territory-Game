import { requireContestant } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=account";
import { api } from "../shared/api.js?v=roles";
import { el } from "../shared/dom.js";
import { noteServerTime } from "../shared/contest-time.js";
import { pointsLabel, rulePointsFor, teamForUser } from "../shared/contest-data.js?v=leaderboard";

const contestId = new URLSearchParams(location.search).get("contest") || "";
let syncAt = 0;

function paint(contest) {
  const title = document.querySelector("#rules-title");
  const empty = document.querySelector("#rules-empty");
  const list = document.querySelector("#rules-list");
  const back = document.querySelector("#back-to-contest");
  if (back) back.href = `/play.html?contest=${encodeURIComponent(contest.id || contestId)}`;
  if (title) title.textContent = contest.name ? `${contest.name} · Revealed rules` : "Revealed rules";
  const rules = Array.isArray(contest.revealedRules) ? contest.revealedRules : [];
  const team = teamForUser(contest);
  if (empty) empty.hidden = rules.length > 0;
  if (!list) return;
  list.hidden = rules.length === 0;
  list.replaceChildren();
  for (const rule of rules) {
    if (!rule || typeof rule.title !== "string" || typeof rule.text !== "string") continue;
    const item = el("li");
    item.append(el("h3", null, rule.title), el("p", null, rule.text));
    const points = team ? rulePointsFor(contest, team.id, rule.id) : 0;
    if (points) {
      const amount = pointsLabel(Math.abs(points));
      item.append(el("p", "rule-points", points > 0
        ? `You got ${amount} from this rule.`
        : `You lost ${amount} from this rule.`));
    }
    if (Number.isInteger(rule.minute)) {
      item.append(el("p", "version-time", rule.minute === 0 ? "Revealed at the start." : `Revealed at minute ${rule.minute}.`));
    }
    list.append(item);
  }
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
      error.textContent = err.message || "The revealed rules could not be opened.";
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
