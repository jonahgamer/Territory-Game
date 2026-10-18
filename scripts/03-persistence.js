// ═══════════════════════════════════════════════════════════════════
// Persistence
// ═══════════════════════════════════════════════════════════════════

function handleSaveError(error, collection) {
  console.error("[save]", error);
  const conflict = Number(error?.status) === 409 || /changed in another tab/i.test(error?.message || "");
  if (collection === "maps") {
    mapDirty = true;
    updateMapSaveButton();
  } else if (collection === "problems") {
    problemDirty = true;
    updateProblemSaveButton();
  }
  if (conflict) {
    if (!saveConflictActive) openSaveConflict(collection);
    return;
  }
  showPageToast(error?.message || "Could not save changes.", "warn");
}

function queueSave(name, task) {
  const next = saveQueues[name].catch(() => {}).then(task);
  saveQueues[name] = next.catch(() => {});
  return next;
}

function noteRevision(name, data) {
  if (Number.isInteger(data?.revision)) revisions[name] = data.revision;
}

async function persistMapsNow() {
  if (!bootstrapped || !isAdmin()) return null;
  if (saveConflictActive) return null;
  return queueSave("maps", async () => {
    try {
      const data = await apiCall("save-maps", { maps, revision: revisions.maps });
      noteRevision("maps", data);
      return data;
    } catch (error) {
      handleSaveError(error, "maps");
      return null;
    }
  });
}

async function persistProblemsNow() {
  if (!bootstrapped || !isAdmin()) return null;
  if (saveConflictActive) return null;
  return queueSave("problems", async () => {
    try {
      const data = await apiCall("save-problems", { problems, revision: revisions.problems });
      noteRevision("problems", data);
      return data;
    } catch (error) {
      handleSaveError(error, "problems");
      return null;
    }
  });
}

async function persistContestsNow() {
  if (!bootstrapped || !isAdmin()) return null;
  if (contests.some((contest) => !contestSchedule(contest))) return null;
  if (saveConflictActive) return null;
  return queueSave("contests", async () => {
    try {
      const data = await apiCall("save-contests", { contests, revision: revisions.contests });
      noteRevision("contests", data);
      return data;
    } catch (error) {
      handleSaveError(error, "contests");
      return null;
    }
  });
}

function persistMaps() {
  if (!bootstrapped || !isAdmin()) return;
  _persistMapsDebounced();
}

function persistProblems() {
  if (!bootstrapped || !isAdmin()) return;
  _persistProblemsDebounced();
}

function persistContests() {
  if (!bootstrapped || !isAdmin()) return;
  if (contests.some((contest) => !contestSchedule(contest))) return;
  _persistContestsDebounced();
}

async function saveContestsNow() {
  if (!bootstrapped || !isAdmin()) return null;
  if (contests.some((contest) => !contestSchedule(contest))) {
    throw new Error("Finish the contest schedule before adding a team.");
  }
  if (saveConflictActive) return null;
  return queueSave("contests", async () => {
    try {
      const data = await apiCall("save-contests", { contests, revision: revisions.contests });
      noteRevision("contests", data);
      return data;
    } catch (error) {
      handleSaveError(error, "contests");
      throw error;
    }
  });
}

function markMapDirty() {
  mapDirty = true;
  if (saveMapButton) saveMapButton.disabled = false;
}

function updateMapSaveButton() {
  if (saveMapButton) saveMapButton.disabled = !mapDirty;
}

async function saveOpenMap() {
  if (!mapDirty || !bootstrapped || !isAdmin()) return;
  const saved = await persistMapsNow();
  if (!saved) return;
  const map = currentMap();
  mapSnapshot = map ? structuredClone(map) : null;
  mapDirty = false;
  updateMapSaveButton();
}

function discardUnsavedMap() {
  if (!mapDirty || !mapSnapshot) return true;
  if (!window.confirm("Leave without saving map changes?")) return false;
  const index = maps.findIndex((item) => item.id === mapSnapshot.id);
  if (index >= 0) maps[index] = mapSnapshot;
  mapDirty = false;
  mapSnapshot = null;
  updateMapSaveButton();
  return true;
}

function updateProblemSaveButton() {
  const saveable = Boolean(problemDraft && (problemDraft.isNew || problemDirty));
  if (saveProblemButton) saveProblemButton.disabled = !saveable;
  if (saveProblemTopButton) saveProblemTopButton.disabled = !saveable;
  if (!problemSaveState) return;
  if (!problemDraft) {
    problemSaveState.textContent = "";
    problemSaveState.dataset.state = "idle";
    return;
  }
  if (problemDirty) {
    problemSaveState.textContent = "Unsaved changes";
    problemSaveState.dataset.state = "dirty";
  } else if (problemDraft.isNew) {
    problemSaveState.textContent = "New problem — not saved yet";
    problemSaveState.dataset.state = "new";
  } else {
    problemSaveState.textContent = "Saved";
    problemSaveState.dataset.state = "saved";
  }
}

function problemHasUnsavedEdits() {
  if (!problemDraft) return false;
  if (problemDirty) return true;
  if (!problemDraft.isNew) return false;
  return Boolean(problemPrompt.value.trim() || problemAnswer.value.trim() || problemLogic.value.trim());
}

function discardUnsavedProblem() {
  if (!problemEditorView || problemEditorView.hidden || !problemHasUnsavedEdits()) {
    if (problemEditorView && !problemEditorView.hidden) problemDraft = null;
    return true;
  }
  if (!window.confirm("Leave without saving this problem?")) return false;
  problemDraft = null;
  problemDirty = false;
  return true;
}

function saveOpenProblem() {
  if (!problemDraft) return;
  const prompt = problemPrompt.value;
  const answer = problemAnswer.value;
  const logic = problemLogic.value;
  problemDraft.prompt = prompt;
  problemDraft.answer = answer;
  problemDraft.logic = logic;
  if (!prompt.trim() || !answer.trim()) {
    problemSaveError.hidden = false;
    problemSaveError.textContent = "Add both a question and an answer before saving.";
    return;
  }
  problemSaveError.hidden = true;
  let problem = findProblem(problemDraft.index, problemDraft.type);
  if (!problem) {
    problem = {
      index: problemDraft.index,
      type: problemDraft.type,
      prompt,
      answer,
      logic,
      difficulty: problemDraft.difficulty,
    };
    problems.push(problem);
    problems.sort(compareProblems);
  } else {
    problem.prompt = prompt;
    problem.answer = answer;
    problem.logic = logic;
    problem.difficulty = problemDraft.difficulty;
  }
  problemDraft.isNew = false;
  problemDirty = false;
  if (bootstrapped && isAdmin()) {
    persistProblemsNow();
  }
  updateProblemSaveButton();
}


