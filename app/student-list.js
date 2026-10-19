import { requireContestant, getSession } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { formatContestTime } from "../shared/contest-time.js";
import { el, renderList } from "../shared/dom.js";

if (requireContestant()) {
  initNav("contests");
  bindToastClose();
  run();
}

async function run() {
  const errorEl = document.querySelector("#load-error");
  const listEl = document.querySelector("#student-contest-list");
  const emptyEl = document.querySelector("#student-empty");
  const username = (getSession()?.user?.username || "").toLowerCase();

  try {
    const data = await loadBootstrap();
    const mine = data.contests.filter((c) =>
      (c.teams || []).some((team) => (team.members || []).some((m) => m.toLowerCase() === username))
    );
    errorEl.hidden = true;
    emptyEl.hidden = mine.length > 0;
    emptyEl.textContent = "You are not on a team yet.";
    listEl.hidden = mine.length === 0;

    renderList(listEl, mine, (contest) => {
      const map = data.maps.find((m) => m.id === contest.mapId);
      const item = el("li");
      const button = el("button", "open-problem");
      button.type = "button";
      const name = el("span", "contest-name-label", contest.name);
      const detail = el("span", "problem-snippet",
        `${map ? map.name : "Map removed"} · ${contest.startAt ? formatContestTime(contest.startAt) : "Schedule not set"}`);
      button.append(name, detail);
      button.addEventListener("click", () => {
        location.assign(`/play.html?contest=${encodeURIComponent(contest.id)}`);
      });
      item.append(button);
      return item;
    });
  } catch (err) {
    errorEl.hidden = false;
    errorEl.textContent = err.message || "Could not load contests.";
  }
}