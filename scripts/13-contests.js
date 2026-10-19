// ═══════════════════════════════════════════════════════════════════
// Contests
// ═══════════════════════════════════════════════════════════════════

function showCompetitions() {
  if (!requireSession()) return;
  if (isContestant()) {
    showStudent();
    return;
  }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  competitionsView.hidden = false;
  setCurrentSection(competitionsButton);
  renderCompetitions();
}

function showContest(contestId) {
  stopPaint();
  if (editingTeamId) resetTeamForm();
  openMapId = null;
  openContestId = contestId;
  adminViewTeamId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  contestView.hidden = false;
  setCurrentSection(competitionsButton);
  renderContest();
}

function isTestingContest(contest) {
  return contest?.mode === "testing";
}

function teamSpawnReady(contest, teamId) {
  if (!contest) return false;
  if (isTestingContest(contest)) return (contest.resolvedTeams || []).includes(teamId);
  return contest.spawnResolved === true;
}

function contestAsTeam(contest, teamId) {
  if (!isTestingContest(contest) || !teamId) return contest;
  return {
    ...contest,
    teams: (contest.teams || []).filter((team) => team.id === teamId),
    spawnResolved: teamSpawnReady(contest, teamId),
    spawnChoices: (contest.spawnChoices || []).filter((choice) => choice.teamId === teamId),
    spawnVotes: (contest.spawnVotes || []).filter((vote) => vote.teamId === teamId),
    spawns: (contest.spawns || []).filter((spawn) => spawn.teamId === teamId),
    claims: (contest.claims || []).filter((claim) => claim.teamId === teamId),
  };
}

function onCreateContestModeClick(event) {
  const button = event.target.closest("[data-contest-mode]");
  if (!button) return;
  newContestMode = button.dataset.contestMode === "testing" ? "testing" : "competition";
  renderContestModeButtons(createContestMode, newContestMode);
  if (contestMapSelect) {
    fillMapSelect(contestMapSelect, contestMapSelect.value, newContestMode);
    updateContestSpawnNote(contestMapSelect, contestMapNote);
  }
}

function onContestModeClick(event) {
  const button = event.target.closest("[data-contest-mode]");
  const contest = currentContest();
  if (!button || !contest || isContestant()) return;
  const mode = button.dataset.contestMode === "testing" ? "testing" : "competition";
  if (contest.mode === mode) return;
  contest.mode = mode;
  contest.spawns = [];
  contest.spawnChoices = [];
  contest.spawnVotes = [];
  contest.claims = [];
  contest.spawnResolved = false;
  contest.resolvedTeams = [];
  adminViewTeamId = null;
  renderContest();
  persistContests();
}

function onTestingTeamViewClick(event) {
  const button = event.target.closest("[data-view-team]");
  if (!button) return;
  adminViewTeamId = button.dataset.viewTeam;
  const contest = currentContest();
  const map = contest && maps.find((item) => item.id === contest.mapId);
  renderTestingTeamView(contest);
  renderAdminBoard(contestAsTeam(contest, adminViewTeamId), map);
}

function renderContestModeButtons(container, mode) {
  if (!container) return;
  for (const button of container.querySelectorAll("[data-contest-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.contestMode === mode));
  }
}

function renderTestingTeamView(contest) {
  if (!testingTeamView) return;
  const testing = isTestingContest(contest);
  testingTeamView.hidden = !testing;
  testingTeamView.replaceChildren();
  if (!testing) return;
  if (!adminViewTeamId || !(contest.teams || []).some((team) => team.id === adminViewTeamId)) {
    adminViewTeamId = contest.teams?.[0]?.id || null;
  }
  for (const team of contest.teams || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.viewTeam = team.id;
    button.textContent = team.name;
    button.setAttribute("aria-pressed", String(team.id === adminViewTeamId));
    testingTeamView.append(button);
  }
}

function createContest(event) {
  event.preventDefault();
  if (isContestant()) return;
  const name = readContestName(contestNameInput.value);
  if (!name) {
    contestFormError.hidden = false;
    contestFormError.textContent = "Give the contest a name.";
    return;
  }
  if (maps.length === 0) {
    contestFormError.hidden = false;
    contestFormError.textContent = "Create a map before starting a contest.";
    return;
  }
  const mapId = contestMapSelect.value;
  const map = maps.find((item) => item.id === mapId);
  const wanted = newContestMode === "testing" ? "testing" : "official";
  if (!map || mapMode(map) !== wanted) {
    contestFormError.hidden = false;
    contestFormError.textContent = wanted === "testing"
      ? "Choose a testing map for a testing contest."
      : "Choose an official map for a competition.";
    return;
  }
  const schedule = readSchedule(
    contestStartInput.value,
    contestDurationInput.value,
    contestSpawnInput.value,
    contestReadyInput.value
  );
  if (schedule.error) {
    contestFormError.hidden = false;
    contestFormError.textContent = schedule.error;
    return;
  }
  contestFormError.hidden = true;
  contests.unshift({
    id: crypto.randomUUID(),
    name,
    mapId,
    contestantIds: [],
    teams: [],
    spawnChoices: [],
    spawnVotes: [],
    spawns: [],
    claims: [],
    spawnResolved: false,
    startAt: schedule.startAt,
    durationMinutes: schedule.durationMinutes,
    spawnMinutes: schedule.spawnMinutes,
    readyMinutes: schedule.readyMinutes,
    mode: newContestMode,
  });
  persistContests();
  contestNameInput.value = "";
  renderCompetitions();
}

function onContestListClick(event) {
  const openButton = event.target.closest("[data-open-contest]");
  if (openButton) navigateTo(["contests", openButton.dataset.openContest]);
}

function deleteOpenContest() {
  if (isContestant()) return;
  const contest = currentContest();
  if (!contest) return;
  const name = contest.name || "this contest";
  if (!confirmTwice(
    `Delete the contest ${name}?`,
    `Delete ${name} now? Teams, scores, and the schedule will be removed.`
  )) return;
  contests = contests.filter((item) => item.id !== openContestId);
  persistContests();
  navigateTo("contests", { replace: true });
}

function commitContestName() {
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const name = readContestName(contestNameField.value);
  if (!name) return;
  contest.name = name;
  contestTitle.textContent = name;
  persistContests();
}

function commitContestMap() {
  const contest = currentContest();
  if (!contest || isContestant()) return;
  if (!maps.some((map) => map.id === contestMapField.value)) return;
  if (contest.mapId !== contestMapField.value) {
    contest.spawns = [];
    contest.spawnChoices = [];
    contest.spawnVotes = [];
    contest.claims = [];
    contest.spawnResolved = false;
    contest.resolvedTeams = [];
  }
  contest.mapId = contestMapField.value;
  updateContestSpawnNote(contestMapField, contestMapEditNote);
  renderContest();
  persistContests();
}

function commitContestSchedule() {
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const schedule = readSchedule(
    contestStartField.value,
    contestDurationField.value,
    contestSpawnField.value,
    contestReadyField.value
  );
  if (schedule.error) {
    contestScheduleError.hidden = false;
    contestScheduleError.textContent = schedule.error;
    return;
  }
  contestScheduleError.hidden = true;
  contest.startAt = schedule.startAt;
  contest.durationMinutes = schedule.durationMinutes;
  contest.spawnMinutes = schedule.spawnMinutes;
  contest.readyMinutes = schedule.readyMinutes;
  persistContests();
}

function finishContestScheduleEdit() {
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const schedule = readSchedule(
    contestStartField.value,
    contestDurationField.value,
    contestSpawnField.value,
    contestReadyField.value
  );
  if (schedule.error) {
    fillContestSchedule(contest);
    contestScheduleError.hidden = Boolean(contestSchedule(contest));
    if (!contestScheduleError.hidden) contestScheduleError.textContent = schedule.error;
    return;
  }
  commitContestSchedule();
  contestStartField.value = formatContestPicker(contest.startAt);
}

function renderTeamForm() {
  if (teamSubmitButton) teamSubmitButton.textContent = editingTeamId ? "Save team" : "Add team";
  if (teamCancelEdit) teamCancelEdit.hidden = !editingTeamId;
  if (teamEditNote) {
    teamEditNote.hidden = !editingTeamId;
    teamEditNote.textContent = editingTeamId
      ? "Editing an existing team. Removed members lose their spawn pick; a change here is saved immediately."
      : "";
  }
}

function resetTeamForm() {
  editingTeamId = null;
  if (teamNameInput) teamNameInput.value = "";
  if (teamMembersInput) teamMembersInput.value = "";
  if (teamFormError) teamFormError.hidden = true;
  renderTeamForm();
}

function beginEditTeam(teamId) {
  const contest = currentContest();
  const team = (contest?.teams || []).find((item) => item.id === teamId);
  if (!team || isContestant()) return;
  editingTeamId = teamId;
  teamNameInput.value = team.name;
  teamMembersInput.value = team.members.join("\n");
  teamFormError.hidden = true;
  renderTeamForm();
  teamNameInput.focus();
  teamForm?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelTeamEdit() {
  resetTeamForm();
}

async function saveTeam(event) {
  event.preventDefault();
  const contest = currentContest();
  if (!contest || isContestant()) return;
  const name = readContestName(teamNameInput.value);
  const members = teamMembersInput.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  if (!name) {
    teamFormError.hidden = false;
    teamFormError.textContent = "Give the team a name.";
    return;
  }
  if (members.length < 1 || members.length > 5 || new Set(members.map((item) => item.toLowerCase())).size !== members.length) {
    teamFormError.hidden = false;
    teamFormError.textContent = "Enter 1 to 5 different student usernames, one per line.";
    return;
  }
  const duplicateName = (contest.teams || []).some((team) => team.id !== editingTeamId && team.name.trim().toLowerCase() === name.toLowerCase());
  if (duplicateName) {
    teamFormError.hidden = false;
    teamFormError.textContent = "Another team in this contest already has that name.";
    return;
  }
  teamFormError.hidden = true;
  if (teamSubmitButton) teamSubmitButton.disabled = true;
  try {
    await saveContestsNow();
    const body = { contestId: contest.id, name, members };
    if (editingTeamId) body.teamId = editingTeamId;
    const data = await apiCall("save-team", body);
    applyContestPlayState(contest, data);
    resetTeamForm();
    renderContest();
  } catch (error) {
    teamFormError.hidden = false;
    teamFormError.textContent = error.message;
  } finally {
    if (teamSubmitButton) teamSubmitButton.disabled = false;
  }
}

async function onContestantListClick(event) {
  if (isContestant()) return;
  const editButton = event.target.closest("[data-edit-team]");
  if (editButton) {
    beginEditTeam(editButton.dataset.editTeam);
    return;
  }
  const button = event.target.closest("[data-remove-team]");
  if (!button) return;
  const contest = currentContest();
  if (!contest) return;
  const teamId = button.dataset.removeTeam;
  const team = contest.teams.find((item) => item.id === teamId);
  const teamName = team ? team.name : "this team";
  if (!confirmTwice(
    `Remove the team ${teamName}?`,
    `Remove ${teamName} now? Their spawn point and solved cells will be cleared.`
  )) return;
  const previous = {
    teams: contest.teams.slice(),
    spawnChoices: contest.spawnChoices.slice(),
    spawnVotes: (contest.spawnVotes || []).slice(),
    spawns: contest.spawns.slice(),
    claims: contest.claims.slice(),
    spawnResolved: contest.spawnResolved,
  };
  if (editingTeamId === teamId) resetTeamForm();
  contest.teams = previous.teams.filter((team) => team.id !== teamId);
  contest.spawnChoices = previous.spawnChoices.filter((choice) => choice.teamId !== teamId);
  contest.spawnVotes = previous.spawnVotes.filter((vote) => vote.teamId !== teamId);
  contest.spawns = previous.spawns.filter((spawn) => spawn.teamId !== teamId);
  contest.claims = previous.claims.filter((claim) => claim.teamId !== teamId);
  if (contest.teams.length === 0) contest.spawnResolved = false;
  renderContest();
  try {
    const data = await apiCall("remove-team", { contestId: contest.id, teamId });
    applyContestPlayState(contest, data);
  } catch (error) {
    Object.assign(contest, previous);
    showPageToast(error.message, "warn");
  }
  renderContest();
}

function refreshOpenContest() {
  if (!studentPlayView.hidden) renderStudentPlay();
  else if (!studentView.hidden) renderStudent();
  else if (!contestView.hidden) renderContest();
  else renderCompetitions();
}

function renderCompetitions() {
  const contestant = isContestant();
  createContestForm.hidden = contestant;
  competitionsLead.textContent = contestant
    ? "Open the contest your team was added to."
    : "Contests, schedules, teams, and scores.";
  if (!contestant) {
    fillMapSelect(contestMapSelect, contestMapSelect.value, newContestMode);
    updateContestSpawnNote(contestMapSelect, contestMapNote);
  }
  contestFormError.hidden = true;
  contestList.replaceChildren();
  contestEmpty.hidden = contests.length > 0;
  contestList.hidden = contests.length === 0;

  for (const contest of contests) {
    const item = document.createElement("li");
    const openButton = document.createElement("button");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    const map = maps.find((item) => item.id === contest.mapId);

    openButton.type = "button";
    openButton.className = "open-problem";
    openButton.dataset.openContest = contest.id;
    openButton.setAttribute("aria-label", `Open contest ${contest.name}`);
    name.className = "contest-name-label";
    name.textContent = contest.name;
    detail.className = "problem-snippet";
    detail.textContent = contestListPreview(contest, map);
    openButton.append(name, detail);
    item.append(openButton);
    contestList.append(item);
  }
}

function renderContest() {
  const contest = currentContest();
  if (!contest) {
    showCompetitions();
    setHashSilently("contests");
    return;
  }

  const map = maps.find((item) => item.id === contest.mapId);
  contestTitle.textContent = contest.name;
  contestNameField.value = contest.name;
  fillMapSelect(contestMapField, contest.mapId, isTestingContest(contest) ? "testing" : "competition", true);
  fillContestSchedule(contest);
  updateContestSpawnNote(contestMapField, contestMapEditNote);
  contestScheduleError.hidden = true;
  renderContestModeButtons(contestModeChoices, isTestingContest(contest) ? "testing" : "competition");
  if (contestModeNote) {
    contestModeNote.textContent = isTestingContest(contest)
      ? "Testing contest. Each team plays its own copy of the map. Changing this clears scores and spawn points."
      : "Competition. Every team shares one map. Changing this clears scores and spawn points.";
  }
  if (contestTeamLead) {
    contestTeamLead.textContent = isTestingContest(contest)
      ? "Add as many teams as you need. Each team has 1 to 5 students and plays alone on this map."
      : "A team has 1 to 5 students and shares one spawn point, territory, and score.";
  }
  if (contestLeaderboardHeading) {
    contestLeaderboardHeading.textContent = isTestingContest(contest) ? "Team scores" : "Leaderboard";
  }
  renderTestingTeamView(contest);
  deleteOpenContestButton.setAttribute("aria-label", `Delete contest ${contest.name}`);
  if (editingTeamId && !(contest.teams || []).some((team) => team.id === editingTeamId)) {
    resetTeamForm();
  } else {
    renderTeamForm();
  }
  renderContestTeams(contest, map);
  updateContestTeamNote(contest, map);
  renderLeaderboard(contestLeaderboard, contestLeaderboardEmpty, contest);
  renderAdminBoard(isTestingContest(contest) ? contestAsTeam(contest, adminViewTeamId) : contest, map);
  paintPhaseClocks();
  ensureContestClock();
}

function updateContestTeamNote(contest, map) {
  if (!contestTeamNote) return;
  const teams = (contest?.teams || []).length;
  if (!map) {
    contestTeamNote.hidden = true;
    return;
  }
  const spawnCount = map.cells.filter((cell) => cell.kind === "spawnpoint").length;
  contestTeamNote.hidden = false;
  if (spawnCount === 0) {
    contestTeamNote.textContent = "This map has no spawn points. Place spawn points on the map before adding teams.";
    return;
  }
  if (isTestingContest(contest)) {
    contestTeamNote.textContent = `${teams} team${teams === 1 ? "" : "s"}. Each team uses the map's ${spawnCount} spawn point${spawnCount === 1 ? "" : "s"} on its own copy.`;
    return;
  }
  if (teams > spawnCount) {
    contestTeamNote.textContent = `Warning: ${teams} teams but only ${spawnCount} spawn points. A team without a spawn point cannot start.`;
    return;
  }
  const free = spawnCount - teams;
  contestTeamNote.textContent = `${teams} of ${spawnCount} spawn point${spawnCount === 1 ? "" : "s"} used. ${free === 0 ? "The contest is full." : `${free} team slot${free === 1 ? "" : "s"} left.`}`;
}

function renderContestTeams(contest, map) {
  const teams = contest.teams || [];
  contestantList.replaceChildren();
  contestantEmpty.hidden = teams.length > 0;
  contestantList.hidden = teams.length === 0;
  for (const team of teams) {
    const item = document.createElement("li");
    if (team.id === editingTeamId) item.classList.add("editing");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    name.className = "contest-name-label";
    const colorDot = document.createElement("span");
    colorDot.className = "team-color-dot";
    colorDot.style.setProperty("--team", teamColor(contest, team.id));
    name.append(colorDot, team.name);
    detail.className = "team-detail";
    detail.textContent = `${team.members.length} member${team.members.length === 1 ? "" : "s"} · ${team.members.join(" · ")} · ${spawnSummary(contest, map, team.id)}`;
    item.append(name, detail);
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "account-action";
    editButton.dataset.editTeam = team.id;
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${team.name}`);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "account-action danger";
    removeButton.dataset.removeTeam = team.id;
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${team.name}`);
    item.append(editButton, removeButton);
    contestantList.append(item);
  }
}

let selectedStudentCell = null;

function showStudent() {
  if (!requireSession()) return;
  if (!isContestant()) {
    showCompetitions();
    return;
  }
  stopPaint();
  openMapId = null;
  openContestId = null;
  selectedStudentCell = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  studentView.hidden = false;
  setCurrentSection(competitionsButton);
  renderStudent();
}

function showStudentPlay(contestId) {
  if (!requireSession() || !isContestant()) return;
  stopPaint();
  openMapId = null;
  openContestId = contestId;
  selectedStudentCell = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  studentPlayView.hidden = false;
  setCurrentSection(competitionsButton);
  renderStudentPlay();
}

function renderStudent() {
  studentError.hidden = loadError.hidden;
  studentError.textContent = loadError.textContent;
  const mine = contests.filter((contest) => teamForUser(contest));
  studentContestList.replaceChildren();
  studentEmpty.hidden = mine.length > 0;
  studentEmpty.textContent = "You are not on a team yet.";
  studentContestList.hidden = mine.length === 0;

  for (const contest of mine) {
    const item = document.createElement("li");
    const openButton = document.createElement("button");
    const name = document.createElement("span");
    const detail = document.createElement("span");
    const map = maps.find((item) => item.id === contest.mapId);

    openButton.type = "button";
    openButton.className = "open-problem";
    openButton.dataset.studentOpen = contest.id;
    openButton.setAttribute("aria-label", `Open contest ${contest.name}`);
    name.className = "contest-name-label";
    name.textContent = contest.name;
    detail.className = "problem-snippet";
    detail.textContent = contestListPreview(contest, map);
    openButton.append(name, detail);
    item.append(openButton);
    studentContestList.append(item);
  }
  shownListPhases = mine.map((contest) => contestPhase(contest)).join("|");
  ensureContestClock();
}

function onStudentListClick(event) {
  const openButton = event.target.closest("[data-student-open]");
  if (openButton) navigateTo(["student", openButton.dataset.studentOpen]);
}

function renderStudentPlay() {
  const contest = currentContest();
  if (!contest || !teamForUser(contest)) {
    showStudent();
    setHashSilently("student");
    return;
  }

  const map = maps.find((item) => item.id === contest.mapId);
  const team = teamForUser(contest);
  const phase = contestPhase(contest);
  const frozen = contestFrozen(contest, map);
  shownPhase = `${phase}:${frozen}:${contest.spawnResolved}`;
  studentPlayTitle.textContent = contest.name;
  studentJoined.hidden = false;
  studentJoined.textContent = `Team ${team.name}. You are ${contestantId()}.`;
  const board = buildLeaderboard(contest);
  const row = board.find((entry) => entry.teamId === team.id);
  const rank = board.findIndex((entry) => entry.teamId === team.id);
  const ownedCells = (contest.spawnResolved && (contest.spawns || []).some((spawn) => spawn.teamId === team.id) ? 1 : 0)
    + (contest.claims || []).filter((claim) => claim.teamId === team.id).length;
  studentTeamSummary.hidden = false;
  studentTeamSummary.textContent = `Members: ${team.members.join(", ")} · Score: ${row?.score ?? 0} · Territory: ${ownedCells} cell${ownedCells === 1 ? "" : "s"} · Rank ${rank < 0 ? "—" : rank + 1} of ${board.length}.`;
  writeStudentStatus(contest, phase, map, frozen);
  renderTeamRoster(contest, map, phase);
  renderLeaderboard(studentLeaderboard, null, contest);
  const showScores = phase === "live" || phase === "ended" || frozen;
  studentLeaderboard.hidden = !showScores;
  studentLeaderboardHeading.hidden = !showScores;
  studentLeaderboardHeading.textContent = frozen || phase === "ended" ? "Leaderboard" : "Scores";
  studentBoard.hidden = !map;

  if (!map) {
    spawnAgreement.hidden = true;
    paintPhaseClocks();
    ensureContestClock();
    return;
  }

  paintPlayGrid(studentGrid, contest, map, { student: true, phase, frozen, team });
  renderSpawnAgreement(contest, map, phase);
  paintPhaseClocks();
  ensureContestClock();
}

function renderTeamRoster(contest, map, phase) {
  if (!teamRoster || !teamRosterBody) return;
  const team = teamForUser(contest);
  const show = Boolean(team && map) && (phase === "ready" || (phase === "spawn" && contest.spawnResolved));
  teamRoster.hidden = !show;
  if (!show) return;
  teamRosterBody.replaceChildren();
  const row = document.createElement("tr");
  const name = document.createElement("td");
  const dot = document.createElement("span");
  dot.className = "team-color-dot";
  dot.style.setProperty("--team", teamColor(contest, team.id));
  const label = document.createElement("span");
  label.textContent = team.name;
  name.append(dot, label);
  const members = document.createElement("td");
  members.className = "team-members-cell";
  for (const member of team.members || []) {
    const chip = document.createElement("span");
    chip.className = "team-member-chip";
    chip.textContent = member;
    members.append(chip);
  }
  const spawn = document.createElement("td");
  const spawnCell = (contest.spawns || []).find((item) => item.teamId === team.id);
  spawn.textContent = spawnCell && map.cells[spawnCell.cell]?.kind === "spawnpoint"
    ? cellPlace(map, spawnCell.cell)
    : "No spawn point";
  row.append(name, members, spawn);
  teamRosterBody.append(row);
}
function renderSpawnAgreement(contest, map, phase) {
  const team = teamForUser(contest);
  const open = Boolean(team && map && phase === "spawn" && !contest.spawnResolved);
  spawnAgreement.hidden = !open;
  if (!open) return;
  spawnVoteList.replaceChildren();
  for (const member of team.members) {
    const vote = (contest.spawnVotes || []).find((item) => item.teamId === team.id && sameContestant(item.username, member));
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = sameContestant(member, contestantId()) ? `${member} (you)` : member;
    const voteCell = document.createElement("td");
    voteCell.textContent = vote ? cellPlace(map, vote.cell) : "Waiting";
    const status = document.createElement("td");
    status.className = "member-status";
    const icon = document.createElement("i");
    icon.className = vote ? "fa-solid fa-circle-check vote-yes" : "fa-solid fa-circle-question vote-no";
    icon.setAttribute("aria-label", vote ? "Voted" : "Not voted yet");
    icon.setAttribute("title", vote ? "Voted" : "Not voted yet");
    status.append(icon);
    row.append(name, voteCell, status);
    spawnVoteList.append(row);
  }
  const agreed = (contest.spawnChoices || []).find((choice) => choice.teamId === team.id);
  const currentCell = Number.isInteger(agreed?.cell) ? agreed.cell : null;
  const cacheKey = `${contest.id}:${team.id}`;
  const previousCell = spawnAgreementCache.get(cacheKey);
  if (previousCell !== undefined && previousCell !== currentCell) {
    if (currentCell === null) {
      showPageToast("Not all team members have chosen the same spawn point yet.", "warn");
    } else {
      showPageToast(`Spawn point: ${cellPlace(map, currentCell)}`, "ok");
    }
  }
  spawnAgreementCache.set(cacheKey, currentCell);
  spawnAgreementNote.textContent = agreed
    ? `Spawn point: ${cellPlace(map, agreed.cell)}`
    : "Spawn point: not agreed yet. Every team member must choose the same cell.";
}
function writeStudentStatus(contest, phase, map, frozen) {
  const mapBit = map ? `${map.name} · ${map.cols} × ${map.rows}` : "The map for this contest has been removed.";
  const team = teamForUser(contest);
  const score = buildLeaderboard(contest).find((row) => row.teamId === team?.id);
  const scoreBit = score ? ` ${team.name} has ${score.score} point${score.score === 1 ? "" : "s"}.` : "";
  studentPlayMeta.textContent = `${mapBit}. ${isTestingContest(contest) ? "Practice map. Other teams cannot see your cells. " : ""}${phaseSentence(contest, phase, frozen)}${scoreBit}`;
  if (!map) {
    studentSpawnNote.hidden = true;
    return;
  }
  studentSpawnNote.hidden = false;
  const finalSpawn = contest.spawnResolved
    ? (contest.spawns || []).find((spawn) => spawn.teamId === team?.id)
    : null;
  if (finalSpawn && map.cells[finalSpawn.cell]?.kind === "spawnpoint") {
    studentSpawnNote.textContent = `Your team starts at ${cellPlace(map, finalSpawn.cell)}.`;
    return;
  }
  if (phase === "spawn" && !contest.spawnResolved) {
    const count = map.cells.filter((cell) => cell.kind === "spawnpoint").length;
    studentSpawnNote.textContent = count > 0
      ? "Click the spawn point you want. It becomes your team's choice when every member has clicked that same cell."
      : "This map has no spawn points.";
    return;
  }
  if (phase === "before") {
    studentSpawnNote.textContent = "The map is visible. Spawning has not started.";
    return;
  }
  studentSpawnNote.textContent = "Your team does not have a spawn point.";
}

function closeStudentProblem() {
  if (studentProblem.hidden) return;
  selectedStudentCell = null;
  activeStudentStatementFrame = null;
  studentProblem.hidden = true;
  studentAnswerForm.hidden = true;
  if (studentAnswerSuccess) studentAnswerSuccess.hidden = true;
  for (const button of studentGrid.querySelectorAll("[aria-pressed='true']")) {
    button.removeAttribute("aria-pressed");
  }
}

function showStudentProblem(contest, map, phase, frozen) {
  const team = teamForUser(contest);
  const cell = selectedStudentCell === null ? null : cellInContest(contest, map.cells[selectedStudentCell]);
  const claim = (contest.claims || []).find((item) => item.cell === selectedStudentCell);
  const playable = phase === "live" && !frozen && cell?.kind === "problem" && !claim
    && adjacentToTeam(map, contest, team?.id, selectedStudentCell);
  if (!playable) {
    studentProblem.hidden = true;
    studentAnswerForm.hidden = true;
    return;
  }
  const problem = findProblem(cell.problemNo, cell.type);
  studentProblem.hidden = false;
  const difficultyName = DIFFICULTY_NAME[cellDifficulty(cell)];
  const points = DIFFICULTY_SCORE[cellDifficulty(cell)];
  studentProblemTag.textContent = `${difficultyName} · ${points} point${points === 1 ? "" : "s"}`;
  studentAnswerForm.hidden = false;
  studentAnswerError.hidden = true;
  if (studentAnswerSuccess) studentAnswerSuccess.hidden = true;
  studentAnswer.style.cssText = "";
  studentAnswer.readOnly = false;
  const promptText = problem && problem.prompt.trim() ? problem.prompt : "This problem has no text yet.";
  activeStudentStatementFrame = setRichText(studentProblemPrompt, promptText, { tag: studentProblemTag.textContent });
  if (!studentAnswer.readOnly) studentAnswer.focus();
}

function onStudentGridClick(event) {
  const button = event.target.closest("[data-index]");
  if (!button || button.disabled) return;
  const contest = currentContest();
  const map = contest && maps.find((item) => item.id === contest.mapId);
  const team = contest && teamForUser(contest);
  if (!map || !team) return;
  const index = Number(button.dataset.index);
  const cell = map.cells[index];
  const phase = contestPhase(contest);
  if (cell?.kind === "spawnpoint" && phase === "spawn" && !contest.spawnResolved) {
    chooseSpawn(contest, index);
    return;
  }
  if (cell?.kind === "problem" && phase === "live" && !contestFrozen(contest, map)) {
    const claim = (contest.claims || []).some((item) => item.cell === index);
    if (claim || !adjacentToTeam(map, contest, team.id, index)) return;
    if (answerOpenMode === "newtab") {
      const url = new URL("answer.html", location.href);
      url.searchParams.set("contest", contest.id);
      url.searchParams.set("cell", String(index));
      window.open(url.href, "_blank", "noopener");
      return;
    }
    selectedStudentCell = index;
    renderStudentPlay();
    showStudentProblem(contest, map, phase, false);
  }
}

async function chooseSpawn(contest, cell) {
  const team = teamForUser(contest);
  if (!team) return;
  const previousVotes = (contest.spawnVotes || []).slice();
  const previousChoices = (contest.spawnChoices || []).slice();
  contest.spawnVotes = previousVotes.filter((vote) => !(vote.teamId === team.id && sameContestant(vote.username, contestantId())));
  contest.spawnVotes.push({ teamId: team.id, username: contestantId(), cell });
  contest.spawnChoices = agreedSpawnChoices(contest);
  renderStudentPlay();
  try {
    const data = await apiCall("choose-spawn", { contestId: contest.id, cell });
    applyContestPlayState(contest, data);
    const map = maps.find((item) => item.id === contest.mapId);
    const finalSpawn = (contest.spawns || []).find((spawn) => spawn.teamId === team.id);
    const agreed = (contest.spawnChoices || []).find((choice) => choice.teamId === team.id);
    const chosenCell = Number.isInteger(finalSpawn?.cell) ? finalSpawn.cell : agreed?.cell;
    if (map && Number.isInteger(chosenCell)) {
      showPageToast(`Spawn point: ${cellPlace(map, chosenCell)}`, "ok");
    } else {
      showPageToast("Not all team members have chosen the same spawn point yet.", "warn");
    }
  } catch (error) {
    contest.spawnVotes = previousVotes;
    contest.spawnChoices = previousChoices;
    showPageToast(error.message, "warn");
  }
  renderStudentPlay();
}

async function submitStudentAnswer(event) {
  event.preventDefault();
  const contest = currentContest();
  const map = contest && maps.find((item) => item.id === contest.mapId);
  const team = contest && teamForUser(contest);
  if (!contest || !map || !team || selectedStudentCell === null) return;
  const cell = selectedStudentCell;
  const submitButton = studentAnswerForm.querySelector("button");
  if (submitButton.disabled) return;
  const submitLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Checking...";
  studentAnswerError.hidden = true;

  const approval = await approveStatementSubmit();
  if (approval.blocked) {
    submitButton.disabled = false;
    submitButton.textContent = submitLabel;
    studentAnswerError.hidden = false;
    studentAnswerError.textContent = approval.message || "Finish the problem before submitting.";
    return;
  }

  const previousClaims = (contest.claims || []).slice();
  const pendingClaim = {
    cell,
    teamId: team.id,
    solvedBy: contestantId(),
    solvedAt: Date.now(),
    pending: true,
  };
  contest.claims = previousClaims.filter((claim) => claim.cell !== cell).concat(pendingClaim);
  renderStudentPlay();

  let failure = "";
  try {
    const data = await apiCall("solve", {
      contestId: contest.id,
      cell,
      answer: studentAnswer.value,
    });
    applyContestPlayState(contest, data);
    studentAnswer.value = "";
    studentAnswerForm.hidden = true;
    if (studentAnswerSuccess) {
      studentAnswerSuccess.hidden = false;
      studentAnswerSuccess.textContent = "Answer accepted. Close this problem to continue.";
    }
  } catch (error) {
    contest.claims = previousClaims;
    failure = error.message;
  }
  submitButton.disabled = false;
  submitButton.textContent = submitLabel;
  renderStudentPlay();
  if (failure) {
    studentAnswerError.hidden = false;
    studentAnswerError.textContent = failure;
  }
}
function studentCellLabel(contest, cell, row, column, index) {
  const team = ownerAt(contest, index, cell);
  const place = `Row ${row}, column ${column}`;
  if (cell.kind === "problem") {
    const difficultyName = DIFFICULTY_NAME[cellDifficulty(cell)];
    if (team && team.id !== teamForUser(contest)?.id) return `${place}, ${difficultyName}, solved by ${team.name}`;
    if (team) return `${place}, ${difficultyName}, ${team.name}`;
    return `${place}, ${difficultyName}`;
  }
  if (team) return `${place}, ${team.name}`;
  return cellLabel(cell, row, column);
}

function ensureContestClock() {
  if (contestClock) return;
  contestClock = setInterval(tickContestClock, 1000);
}

function tickContestClock() {
  const onList = studentView && !studentView.hidden;
  const onPlay = studentPlayView && !studentPlayView.hidden;
  const onAdmin = contestView && !contestView.hidden && isAdmin();
  if (!onList && !onPlay && !onAdmin) {
    clearInterval(contestClock);
    contestClock = null;
    return;
  }
  paintPhaseClocks();
  if (onPlay || onAdmin) {
    const contest = currentContest();
    if (contest) syncContest(contest);
    if (onPlay) {
      const phase = contestPhase(contest);
      const map = contest && maps.find((item) => item.id === contest.mapId);
      const signature = contest ? `${phase}:${contestFrozen(contest, map)}:${contest.spawnResolved}` : "";
      if (signature !== shownPhase) renderStudentPlay();
      else if (contest) writeStudentStatus(contest, phase, map, contestFrozen(contest, map));
    }
  }
  if (onList) {
    refreshStudentRoster();
    const signature = contests.filter((contest) => teamForUser(contest)).map((contest) => contestPhase(contest)).join("|");
    if (signature !== shownListPhases) renderStudent();
  }
}

let rosterSyncing = false;

function studentRosterKey() {
  return contests
    .filter((contest) => teamForUser(contest))
    .map((contest) => `${contest.id}:${contest.name}:${teamForUser(contest)?.name}:${contestPhase(contest)}`)
    .join("|");
}

async function refreshStudentRoster() {
  if (!bootstrapped || !isContestant() || rosterSyncing) return;
  const now = Date.now();
  if (now - contestSyncAt < contestSyncGap()) return;
  contestSyncAt = now;
  rosterSyncing = true;
  try {
    const before = studentRosterKey();
    const data = await apiCall("bootstrap");
    noteServerTime(data.serverNow);
    if (Array.isArray(data.maps)) maps = data.maps;
    if (Array.isArray(data.contests)) contests = data.contests.map(loadedContest);
    if (studentView && !studentView.hidden && studentRosterKey() !== before) renderStudent();
  } catch (error) {
    console.error("[roster]", error);
  } finally {
    rosterSyncing = false;
  }
}

function serverNow() {
  return Date.now() + serverOffsetMs;
}

function noteServerTime(serverNowMs) {
  if (typeof serverNowMs === "number" && Number.isFinite(serverNowMs)) {
    serverOffsetMs = serverNowMs - Date.now();
  }
}

function contestSchedule(contest) {
  if (!contest || !Number.isInteger(contest.startAt)) return null;
  const duration = contest.durationMinutes;
  const spawn = contest.spawnMinutes;
  const ready = contest.readyMinutes;
  if (![duration, spawn, ready].every((value) => Number.isInteger(value))) return null;
  if (duration < 1 || duration > MAX_CONTEST_MINUTES) return null;
  if (spawn < 0 || ready < 0 || spawn > MAX_CONTEST_MINUTES || ready > MAX_CONTEST_MINUTES) return null;
  if (spawn + ready >= duration) return null;
  const minute = 60 * 1000;
  return {
    startAt: contest.startAt,
    spawnEnd: contest.startAt + spawn * minute,
    liveAt: contest.startAt + (spawn + ready) * minute,
    endAt: contest.startAt + duration * minute,
    duration,
    spawn,
    ready,
  };
}

function contestPhase(contest, now = serverNow()) {
  const schedule = contestSchedule(contest);
  if (!schedule) return "unscheduled";
  if (now < schedule.startAt) return "before";
  if (now < schedule.spawnEnd) return "spawn";
  if (now < schedule.liveAt) return "ready";
  if (now < schedule.endAt) return "live";
  return "ended";
}

function phaseLabel(contest) {
  const phase = contestPhase(contest);
  const schedule = contestSchedule(contest);
  if (!schedule) return "Schedule not set";
  if (phase === "before") return `Starts ${formatContestTime(schedule.startAt)}`;
  if (phase === "spawn") return "Agreeing on spawn points";
  if (phase === "ready") return "Waiting for the contest";
  if (phase === "live") return "Contest in progress";
  return "Ended";
}

function phaseSentence(contest, phase, frozen = false) {
  const schedule = contestSchedule(contest);
  if (!schedule) return "The schedule is not set yet.";
  if (frozen && phase !== "ended") return "Every problem is solved. The board is frozen.";
  if (phase === "before") {
    if (schedule.spawn === 0) return `The contest begins ${formatContestTime(schedule.liveAt)}.`;
    return `Spawning starts ${formatContestTime(schedule.startAt)} and lasts ${schedule.spawn} min. The contest begins ${formatContestTime(schedule.liveAt)}.`;
  }
  if (phase === "spawn") {
    return contest.spawnResolved
      ? `Spawn points are assigned. The wait begins ${formatContestTime(schedule.spawnEnd)}.`
      : "Agree on one spawn point with your team before this phase ends.";
  }
  if (phase === "ready") return `Spawning is closed. The contest begins ${formatContestTime(schedule.liveAt)}. Your team's outline is white.`;
  if (phase === "live") return `Solve a problem next to your territory before ${formatContestTime(schedule.endAt)}. Easy is 1, normal 2, hard 3, and insane 4.`;
  return `The contest ended ${formatContestTime(schedule.endAt)}. The board is frozen.`;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

function phaseClock(contest, now = serverNow()) {
  const phase = contestPhase(contest, now);
  const schedule = contestSchedule(contest);
  if (!schedule) return "Schedule not set";
  if (phase === "ended") return "Ended";
  const end = phase === "before" ? schedule.startAt
    : phase === "spawn" ? schedule.spawnEnd
    : phase === "ready" ? schedule.liveAt
    : schedule.endAt;
  const label = phase === "before" ? "Until spawning"
    : phase === "spawn" ? "Spawn time left"
    : phase === "ready" ? "Until the contest"
    : "Contest time left";
  return `${label} ${formatCountdown(end - now)}`;
}

function phaseClockNode(contest) {
  const node = document.createElement("span");
  node.dataset.phaseClock = contest.id;
  node.textContent = phaseClock(contest);
  return node;
}

function paintPhaseClocks() {
  const boxes = [
    [studentCountdown, studentPlayView && !studentPlayView.hidden ? currentContest() : null],
    [contestCountdown, contestView && !contestView.hidden && isAdmin() ? currentContest() : null],
  ];
  for (const [node, contest] of boxes) {
    if (!node) continue;
    const text = contest ? phaseClock(contest) : "";
    node.hidden = !text;
    node.textContent = text;
  }
  for (const node of document.querySelectorAll("[data-phase-clock]")) {
    const contest = contests.find((item) => item.id === node.dataset.phaseClock);
    if (contest) node.textContent = phaseClock(contest);
  }
}

function contestListPreview(contest, map) {
  const mapName = map ? map.name : "Map removed";
  const schedule = contestSchedule(contest);
  const when = schedule ? formatContestTime(schedule.startAt) : "Schedule not set";
  return `${mapName} · ${when}`;
}

function readWholeMinutes(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_CONTEST_MINUTES) return null;
  return minutes;
}

function readSchedule(startValue, durationValue, spawnValue, readyValue) {
  const startAt = parseContestTime(startValue);
  const durationMinutes = readWholeMinutes(durationValue);
  const spawnMinutes = readWholeMinutes(spawnValue);
  const readyMinutes = readWholeMinutes(readyValue);
  if (startAt === null) return { error: "Choose a start date and time." };
  if (durationMinutes === null || spawnMinutes === null || readyMinutes === null) {
    return { error: "Use whole minutes from 0 to 10080. Duration must be at least 1." };
  }
  if (durationMinutes < 1) return { error: "Duration must be at least 1 minute." };
  if (spawnMinutes + readyMinutes >= durationMinutes) {
    return { error: "Spawn time and the wait before the contest must be shorter than the duration." };
  }
  return { startAt, durationMinutes, spawnMinutes, readyMinutes };
}

function parseContestTime(value) {
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
    || date.getSeconds() !== second
  ) return null;
  return date.getTime();
}

function formatContestPicker(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatContestTime(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fillContestSchedule(contest) {
  contestStartField.value = Number.isInteger(contest.startAt) ? formatContestPicker(contest.startAt) : "";
  contestDurationField.value = Number.isInteger(contest.durationMinutes) ? String(contest.durationMinutes) : "";
  contestSpawnField.value = Number.isInteger(contest.spawnMinutes) ? String(contest.spawnMinutes) : "";
  contestReadyField.value = Number.isInteger(contest.readyMinutes) ? String(contest.readyMinutes) : "";
}

function updateContestSpawnNote(select, note) {
  const map = maps.find((item) => item.id === select.value);
  if (!map) {
    note.hidden = true;
    return;
  }
  const count = map.cells.filter((cell) => cell.kind === "spawnpoint").length;
  note.hidden = false;
  note.textContent = count === 0
    ? `${map.name} has no spawn points yet. Place them on the map.`
    : `${map.name} has ${count} spawn point${count === 1 ? "" : "s"}.`;
}

function spawnSummary(contest, map, teamId) {
  const team = (contest.teams || []).find((item) => item.id === teamId);
  const votes = (contest.spawnVotes || []).filter((vote) => vote.teamId === teamId);
  const ready = teamSpawnReady(contest, teamId);
  const choice = !ready
    ? (contest.spawnChoices || []).find((item) => item.teamId === teamId)
    : null;
  const spawn = ready
    ? (contest.spawns || []).find((item) => item.teamId === teamId)
    : null;
  const cell = spawn?.cell ?? choice?.cell;
  if (!Number.isInteger(cell)) {
    if (ready) return "No spawn point";
    return team ? `${votes.length} of ${team.members.length} chosen` : "Has not chosen";
  }
  if (!map || cell < 0 || cell >= map.cells.length || map.cells[cell].kind !== "spawnpoint") {
    return "Spawn point no longer on the map";
  }
  return `${ready ? "Starts" : "Agrees"} ${cellPlace(map, cell)}`;
}

function loadedContest(raw) {
  const teams = normalizeTeams(raw.teams);
  return {
    id: raw.id,
    name: raw.name,
    mapId: raw.mapId,
    contestantIds: teams.flatMap((team) => team.members),
    teams,
    startAt: Number.isInteger(raw.startAt) ? raw.startAt : null,
    durationMinutes: Number.isInteger(raw.durationMinutes) ? raw.durationMinutes : null,
    spawnMinutes: Number.isInteger(raw.spawnMinutes) ? raw.spawnMinutes : null,
    readyMinutes: Number.isInteger(raw.readyMinutes) ? raw.readyMinutes : null,
    mode: raw.mode === "testing" ? "testing" : "competition",
    resolvedTeams: Array.isArray(raw.resolvedTeams) ? raw.resolvedTeams.filter((id) => typeof id === "string") : [],
    spawnChoices: normalizeTeamCells(raw.spawnChoices),
    spawnVotes: normalizeSpawnVotes(raw.spawnVotes),
    spawns: normalizeTeamCells(raw.spawns),
    claims: normalizeClaims(raw.claims),
    spawnResolved: raw.spawnResolved === true,
  };
}

function fillMapSelect(select, selectedId, contestMode = "competition", keepCurrent = false) {
  const previous = selectedId || select.value;
  const wanted = contestMode === "testing" ? "testing" : "official";
  const choices = maps.filter((map) => mapMode(map) === wanted || (keepCurrent && map.id === previous));
  select.replaceChildren();
  if (choices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = wanted === "testing" ? "No testing maps yet" : "No official maps yet";
    select.append(option);
    return;
  }
  for (const map of choices) {
    const option = document.createElement("option");
    option.value = map.id;
    const kind = mapMode(map) === "testing" ? "Testing" : "Official";
    option.textContent = `${mapOptionLabel(map)} · ${kind}`;
    select.append(option);
  }
  if (previous && choices.some((map) => map.id === previous)) {
    select.value = previous;
    return;
  }
  if (previous) {
    const missing = document.createElement("option");
    missing.value = "";
    missing.textContent = "Map removed";
    select.prepend(missing);
    select.value = "";
  }
}

function mapOptionLabel(map) {
  const base = `${map.name} · ${map.cols} × ${map.rows}`;
  const same = maps.filter((item) => `${item.name} · ${item.cols} × ${item.rows}` === base);
  if (same.length === 1) return base;
  return `${base} (${same.findIndex((item) => item.id === map.id) + 1})`;
}

function readMapName(value) {
  const name = value.trim();
  if (!name || name.length > 60) return null;
  return name;
}

function currentContest() {
  return contests.find((contest) => contest.id === openContestId) || null;
}

function readContestName(value) {
  const name = value.trim();
  if (!name || name.length > 60) return null;
  return name;
}


