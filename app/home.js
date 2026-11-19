import { requireSession, getSession, isAdmin, isRoot } from "../shared/session.js?v=home";
import { initNav } from "../shared/nav.js?v=home";
import { bindToastClose } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=home";
import { el, renderList } from "../shared/dom.js";
import { formatContestTime, noteServerTime, phaseLabel } from "../shared/contest-time.js";

if (requireSession()) {
  initNav("home");
  bindToastClose();
  run();
}

async function run() {
  const user = getSession()?.user;
  const name = user?.displayName || user?.username || "there";
  const admin = isAdmin();
  document.querySelector("#home-greeting").textContent = `Hello, ${name}`;
  document.querySelector("#home-role").textContent = isRoot() ? "Root" : admin ? "Admin" : "Student";
  document.querySelector("#home-lead").textContent = admin
    ? "Puzzle Territory is a team contest on a map. Build the maps and problems, then open a contest when it is time to play."
    : "Puzzle Territory is a team contest on a map. Solve problems on cells next to your territory and grow your team's score.";
  renderLinks(admin);
  const contestsHeading = document.querySelector("#home-contests-heading");
  contestsHeading.textContent = admin ? "Contests" : "Your contests";
  try {
    const [contestData, creditData] = await Promise.all([
      loadPage(admin ? "page-contests" : "page-student-contests"),
      loadPage("page-credits"),
    ]);
    noteServerTime(contestData.serverNow);
    renderContests(contestData.contests || [], admin, contestData.maps || []);
    renderCredit(creditData.versions || []);
  } catch (err) {
    const error = document.querySelector("#load-error");
    error.hidden = false;
    error.textContent = err.message || "Could not open the home page.";
  }
}

function renderLinks(admin) {
  const links = admin ? [
    ["/admin/maps.html", "Maps", "Create and edit the boards teams play on."],
    ["/admin/problems.html", "Problems", "Write the questions that sit on the map."],
    ["/admin/contests.html", "Contests", "Set the schedule, teams, and maps."],
    ["/admin/tutorial.html", "Tutorial", "Read how a contest is put together."],
    ["/admin/rules.html", "Rules", "The public rules contestants can read."],
    ["/admin/hidden-rules.html", "Hidden rules", "The rules a contest can reveal later."],
    ["/admin/accounts.html", "Accounts", "Students, admins, and who can sign in."],
    ["/admin/credits.html", "Credits", "Version notes for this site."],
  ] : [
    ["/index.html", "Contests", "Open the contest your team is playing."],
    ["/admin/rules.html", "Rules", "Read the rules for the game."],
    ["/admin/credits.html", "Credits", "See what changed in recent versions."],
    ["/settings.html", "Settings", "Choose how an answer page opens."],
  ];
  if (isRoot()) links.push(["/admin/backups.html", "Backups", "Save or restore the database."]);
  const list = document.querySelector("#home-links");
  list.replaceChildren();
  for (const [href, title, text] of links) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = href;
    const heading = document.createElement("strong");
    heading.textContent = title;
    const detail = document.createElement("span");
    detail.textContent = text;
    link.append(heading, detail);
    item.append(link);
    list.append(item);
  }
}

function renderContests(contests, admin, maps) {
  const empty = document.querySelector("#home-contests-empty");
  const list = document.querySelector("#home-contests");
  const mapNames = new Map((maps || []).map((map) => [map.id, map.name]));
  empty.hidden = contests.length > 0;
  empty.textContent = admin ? "No contests yet." : "You are not on a team yet.";
  list.hidden = contests.length === 0;
  const ordered = contests.slice().sort((a, b) => (b.startAt || 0) - (a.startAt || 0));
  renderList(list, ordered, (contest) => {
    const item = el("li");
    const button = el("button", "open-problem");
    button.type = "button";
    const names = contest.mapNames || (contest.mapIds || []).map((id) => mapNames.get(id)).filter(Boolean);
    const team = (contest.teams || [])[0];
    const bits = [
      names.length ? names.join(", ") : "No map",
      phaseLabel(contest),
      contest.startAt ? formatContestTime(contest.startAt) : "",
      team ? `Team ${team.name}` : "",
      contest.mode === "testing" ? "Testing" : "",
    ].filter(Boolean);
    button.append(el("span", "contest-name-label", contest.name), el("span", "problem-snippet", bits.join(" · ")));
    button.addEventListener("click", () => {
      location.assign(admin
        ? `/admin/contest.html?id=${encodeURIComponent(contest.id)}`
        : `/play.html?contest=${encodeURIComponent(contest.id)}`);
    });
    item.append(button);
    return item;
  });
}

function renderCredit(versions) {
  const host = document.querySelector("#home-credit");
  const note = versions.find((item) => item && item.version);
  if (!note) return;
  host.replaceChildren();
  const title = el("p", "version-name", note.version);
  const message = el("p", "version-message", note.message || "");
  const when = note.createdAt ? formatContestTime(note.createdAt) : "";
  const time = el("p", "version-time", when);
  const more = document.createElement("a");
  more.href = "/admin/credits.html";
  more.textContent = "All credits";
  host.append(title, message, time, more);
}
