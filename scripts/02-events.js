// ═══════════════════════════════════════════════════════════════════
// Event wiring
// ═══════════════════════════════════════════════════════════════════

homeButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo(isContestant() ? "student" : "maps");
});
mobileHome?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo(isContestant() ? "student" : "maps");
});
menuButton?.addEventListener("click", () => setMenuOpen(!document.body.classList.contains("menu-open")));
sidebarBackdrop?.addEventListener("click", () => setMenuOpen(false));
document.querySelector(".sidebar")?.addEventListener("click", (event) => {
  if (!event.target.closest("button, input, a, textarea")) setMenuOpen(false);
  else if (event.target.closest("button, a")) setMenuOpen(false);
});
document.querySelector("main")?.addEventListener("click", () => {
  if (document.body.classList.contains("menu-open")) setMenuOpen(false);
});
// The problem panel is closed only by the Close button. Clicking the
// backdrop and Escape do not dismiss it.
studentProblemClose?.addEventListener("click", closeStudentProblem);
document?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setMenuOpen(false);
});
document?.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
  if (!problemEditorView || problemEditorView.hidden) return;
  event.preventDefault();
  saveOpenProblem();
});
mapsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("maps");
});
problemsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("problems");
});
competitionsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo(isContestant() ? "student" : "contests");
});
tutorialButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("tutorial");
});
creditsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("credits");
});
settingsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  navigateTo("settings");
});
accountForm?.addEventListener("submit", createAccount);
accountList?.addEventListener("click", onAccountListClick);
accountSearch?.addEventListener("input", () => {
  accountQuery = accountSearch.value.trim();
  renderAccounts();
});
accountFilters?.addEventListener("click", onAccountFilterClick);
answerOpenModeChoices?.addEventListener("click", onAnswerModeClick);
accountButton?.addEventListener("click", logOut);
versionForm?.addEventListener("submit", addVersion);
pageToastClose?.addEventListener("click", hidePageToast);
createContestForm?.addEventListener("submit", createContest);
createContestMode?.addEventListener("click", onCreateContestModeClick);
contestModeChoices?.addEventListener("click", onContestModeClick);
testingTeamView?.addEventListener("click", onTestingTeamViewClick);
contestList?.addEventListener("click", onContestListClick);
contestBackButton?.addEventListener("click", () => navigateTo("contests"));
deleteOpenContestButton?.addEventListener("click", deleteOpenContest);
contestForm?.addEventListener("submit", (event) => event.preventDefault());
contestNameField?.addEventListener("input", commitContestName);
contestNameField?.addEventListener("change", () => {
  const contest = currentContest();
  if (contest && !readContestName(contestNameField.value)) contestNameField.value = contest.name;
});
contestMapField?.addEventListener("change", commitContestMap);
contestMapSelect?.addEventListener("change", () => updateContestSpawnNote(contestMapSelect, contestMapNote));
contestStartField?.addEventListener("input", commitContestSchedule);
contestDurationField?.addEventListener("input", commitContestSchedule);
contestSpawnField?.addEventListener("input", commitContestSchedule);
contestReadyField?.addEventListener("input", commitContestSchedule);
contestStartField?.addEventListener("change", finishContestScheduleEdit);
contestDurationField?.addEventListener("change", finishContestScheduleEdit);
contestSpawnField?.addEventListener("change", finishContestScheduleEdit);
contestReadyField?.addEventListener("change", finishContestScheduleEdit);
teamForm?.addEventListener("submit", saveTeam);
teamCancelEdit?.addEventListener("click", cancelTeamEdit);
contestantList?.addEventListener("click", onContestantListClick);
studentContestList?.addEventListener("click", onStudentListClick);
studentBack?.addEventListener("click", () => navigateTo("student"));
studentGrid?.addEventListener("click", onStudentGridClick);
studentAnswerForm?.addEventListener("submit", submitStudentAnswer);
problemSectionChoices?.addEventListener("click", onProblemSectionClick);
problemSection?.addEventListener("click", onProblemListClick);
problemSection?.addEventListener("change", onProblemSelectionChange);
problemSearch?.addEventListener("input", onProblemSearchInput);
problemSearch?.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && problemSearch.value) {
    problemSearch.value = "";
    onProblemSearchInput();
  }
});
problemDifficultyFilterButtons?.addEventListener("click", onProblemDifficultyFilterClick);
problemSort?.addEventListener("change", onProblemSortChange);
problemSelectToggle?.addEventListener("click", toggleProblemSelectMode);
problemSelectPage?.addEventListener("change", selectProblemPage);
problemSelectAll?.addEventListener("change", selectAllProblems);
problemBulkDifficulty?.addEventListener("click", onBulkDifficultyClick);
problemBulkDelete?.addEventListener("click", deleteSelectedProblems);
placeTypeChoices?.addEventListener("click", onPlaceTypeClick);
problemBackButton?.addEventListener("click", closeProblemEditor);
deleteOpenProblemButton?.addEventListener("click", deleteOpenProblem);
duplicateOpenProblemButton?.addEventListener("click", duplicateCurrentProblem);
problemEditorForm?.addEventListener("submit", (event) => event.preventDefault());
problemIndexInput?.addEventListener("change", () => {
  if (problemReturn === "map") return;
  commitProblemIndex();
});
problemIndexInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    problemIndexInput.blur();
  }
});
problemTypeChoices?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-problem-type]");
  if (!button || editingProblemNo === null || problemReturn === "map") return;
  setProblemType(editingProblemNo, button.dataset.problemType);
});
problemDifficultyChoices?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-problem-difficulty]");
  if (!button || editingProblemNo === null) return;
  setProblemDifficulty(button.dataset.problemDifficulty);
});
problemPrompt?.addEventListener("input", () => {
  updateProblemField("prompt", problemPrompt.value);
  requestAnimationFrame(renderProblemPreview);
});
problemAnswer?.addEventListener("input", () => {
  updateProblemField("answer", problemAnswer.value);
  requestAnimationFrame(renderProblemPreview);
});
problemLogic?.addEventListener("input", () => {
  updateProblemField("logic", problemLogic.value);
});
backButton?.addEventListener("click", () => {
  if (ROUTED) navigateTo("maps");
  else showMaps();
});
saveMapButton?.addEventListener("click", saveOpenMap);
saveProblemButton?.addEventListener("click", saveOpenProblem);
saveProblemTopButton?.addEventListener("click", saveOpenProblem);
deleteOpenMapButton?.addEventListener("click", deleteOpenMap);
createForm?.addEventListener("submit", createMap);
createMapMode?.addEventListener("click", onCreateMapModeClick);
mapModeChoices?.addEventListener("click", onMapModeClick);
editorNameInput?.addEventListener("input", commitMapName);
editorNameInput?.addEventListener("change", () => {
  const map = currentMap();
  if (map && !readMapName(editorNameInput.value)) editorNameInput.value = map.name;
});
mapList?.addEventListener("click", onMapListClick);
kindProblem?.addEventListener("click", () => chooseTool("problem"));
kindSpawnpoint?.addEventListener("click", () => chooseTool("spawnpoint"));
kindObstacle?.addEventListener("click", () => chooseTool("obstacle"));
kindEmpty?.addEventListener("click", () => chooseTool("empty"));
editorGrid?.addEventListener("pointerdown", startPaint);
placeModeChoices?.addEventListener("click", onPlaceModeClick);
placePickTypeChoices?.addEventListener("click", onPlacePickTypeClick);
placePickDifficultyChoices?.addEventListener("click", onPlacePickDifficultyClick);
placePickSourceChoices?.addEventListener("click", onPlacePickSourceClick);
problemNoInput?.addEventListener("input", () => {
  problemNoError.hidden = true;
});


