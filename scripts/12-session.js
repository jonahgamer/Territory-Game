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

function paintPlayGrid(grid, contest, map, options) {
  grid.dataset.cols = String(map.cols);
  grid.dataset.rows = String(map.rows);
  layoutMapGrid(grid, map.cols, map.rows);
  grid.replaceChildren();
  const recentClaims = collectRecentClaims(contest);
  const choosing = options.student && options.phase === "spawn" && !contest.spawnResolved;
  map.cells.forEach((cell, index) => {
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


