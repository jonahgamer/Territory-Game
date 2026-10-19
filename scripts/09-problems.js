// ═══════════════════════════════════════════════════════════════════
// Problems
// ═══════════════════════════════════════════════════════════════════

function onProblemSectionClick(event) {
  const button = event.target.closest("[data-section]");
  if (!button || !typeInfo(button.dataset.section)) return;
  activeProblemType = button.dataset.section;
  problemPage = 1;
  problemQuery = "";
  problemDifficultyFilter = "all";
  problemSortMode = "index";
  problemSelectMode = false;
  selectedProblemKeys.clear();
  if (problemSearch) problemSearch.value = "";
  if (ROUTED) navigateTo(["problems", button.dataset.section]);
  else {
    activeProblemType = button.dataset.section;
    setHashSilently(["problems", button.dataset.section]);
    renderProblems();
  }
}

function syncProblemToolbar() {
  if (problemSearch && problemSearch.value !== problemQuery && document.activeElement !== problemSearch) {
    problemSearch.value = problemQuery;
  }
  if (problemSort) problemSort.value = problemSortMode;
  if (problemDifficultyFilterButtons) {
    for (const button of problemDifficultyFilterButtons.querySelectorAll("[data-problem-difficulty-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.problemDifficultyFilter === problemDifficultyFilter));
    }
  }
  if (problemSelectAllLabel) {
    const filtering = Boolean(problemQuery) || problemDifficultyFilter !== "all";
    problemSelectAllLabel.textContent = filtering ? "All results" : "All";
  }
}

const _applyProblemSearch = debounce(() => {
  problemQuery = problemSearch?.value.trim() || "";
  problemPage = 1;
  selectedProblemKeys.clear();
  renderProblems();
}, 150);

function onProblemSearchInput() {
  _applyProblemSearch();
}

function onProblemDifficultyFilterClick(event) {
  const button = event.target.closest("[data-problem-difficulty-filter]");
  if (!button) return;
  const next = button.dataset.problemDifficultyFilter;
  if (next !== "all" && !DIFFICULTIES.includes(next)) return;
  problemDifficultyFilter = next;
  problemPage = 1;
  selectedProblemKeys.clear();
  renderProblems();
}

function onProblemSortChange() {
  const next = problemSort?.value;
  if (!["index", "index-desc", "difficulty"].includes(next)) return;
  problemSortMode = next;
  problemPage = 1;
  selectedProblemKeys.clear();
  renderProblems();
}

function toggleProblemSelectMode() {
  problemSelectMode = !problemSelectMode;
  if (!problemSelectMode) selectedProblemKeys.clear();
  renderProblems();
}

function addProblem(type) {
  const problemType = typeInfo(type) ? type : "math";
  const index = nextProblemNo(problemType);
  if (index === null) {
    showPageToast(`Every index from ${YEAR_INDEX_START} to ${YEAR_INDEX_END} is already used for ${typeInfo(problemType).name}.`, "warn");
    return;
  }
  navigateTo(["problems", problemType, String(index)]);
}

function deleteOpenProblem() {
  if (problemDraft?.isNew && !findProblem(problemDraft.index, problemDraft.type)) {
    const type = problemDraft.type;
    problemDraft = null;
    problemDirty = false;
    if (problemReturn === "map" && openMapId) navigateTo(["maps", openMapId], { replace: true });
    else navigateTo(["problems", type], { replace: true });
    return;
  }
  deleteProblem(editingProblemNo, editingProblemType);
}

function onProblemListClick(event) {
  if (event.target.closest("#add-problem")) {
    if (activeProblemType) addProblem(activeProblemType);
    return;
  }

  const pageButton = event.target.closest("[data-problem-page]");
  if (pageButton) {
    if (pageButton.disabled) return;
    const next = Number(pageButton.dataset.problemPage);
    if (!Number.isInteger(next)) return;
    problemPage = next;
    renderProblems();
    return;
  }

  const duplicateButton = event.target.closest("[data-duplicate-problem]");
  if (duplicateButton) {
    duplicateProblem(Number(duplicateButton.dataset.duplicateProblem), duplicateButton.dataset.duplicateType);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-problem]");
  if (deleteButton) {
    deleteProblem(Number(deleteButton.dataset.deleteProblem), deleteButton.dataset.deleteType);
    return;
  }

  if (problemSelectMode) {
    const row = event.target.closest(".problem-row");
    if (row && !event.target.closest(".problem-check")) {
      const box = row.querySelector("[data-select-problem]");
      if (box) {
        box.checked = !box.checked;
        onProblemSelectionChange({ target: box });
      }
      return;
    }
  }

  const openButton = event.target.closest("[data-open-problem]");
  if (!openButton) return;
  navigateTo(["problems", openButton.dataset.openType, openButton.dataset.openProblem]);
}

function duplicateProblem(index, type) {
  const source = findProblem(index, type);
  if (!source) return;
  const copyType = typeInfo(type) ? type : "math";
  const nextIndex = nextProblemNo(copyType);
  if (nextIndex === null) {
    showPageToast(`Every index from ${YEAR_INDEX_START} to ${YEAR_INDEX_END} is already used for ${typeInfo(copyType).name}.`, "warn");
    return;
  }
  const copy = {
    index: nextIndex,
    type: copyType,
    prompt: source.prompt,
    answer: source.answer,
    logic: source.logic || "",
    difficulty: problemDifficulty(source),
  };
  problems.push(copy);
  problems.sort(compareProblems);
  persistProblems();
  navigateTo(["problems", copyType, String(nextIndex)]);
}

function duplicateCurrentProblem() {
  if (!problemDraft) return;
  if (problemDraft.isNew || problemDirty) {
    saveOpenProblem();
    if (!problemDraft || problemDraft.isNew || problemDirty) return;
  }
  const type = problemDraft.type;
  const nextIndex = nextProblemNo(type);
  if (nextIndex === null) {
    showPageToast(`Every index from ${YEAR_INDEX_START} to ${YEAR_INDEX_END} is already used for ${typeInfo(type).name}.`, "warn");
    return;
  }
  pendingProblemDraft = {
    index: nextIndex,
    type,
    prompt: problemPrompt.value,
    answer: problemAnswer.value,
    logic: problemLogic.value,
    difficulty: problemDraft.difficulty,
    isNew: true,
  };
  navigateTo(["problems", type, String(nextIndex)]);
}
function showProblemEditor(index, type, fromMap) {
  const problemType = typeInfo(type) ? type : "math";
  const existing = findProblem(index, problemType);
  const pending = pendingProblemDraft;
  pendingProblemDraft = null;
  if (pending && pending.index === index && pending.type === problemType) {
    problemDraft = pending;
  } else {
    problemDraft = existing
      ? {
        index: existing.index,
        type: existing.type,
        prompt: existing.prompt,
        answer: existing.answer,
        logic: existing.logic || "",
        difficulty: problemDifficulty(existing),
        isNew: false,
      }
      : { index, type: problemType, prompt: "", answer: "", logic: "", difficulty: "normal", isNew: true };
  }
  problemDirty = false;
  stopPaint();
  if (!fromMap) openMapId = null;
  openContestId = null;
  editingProblemNo = index;
  editingProblemType = problemType;
  problemReturn = fromMap ? "map" : "list";
  hideViews();
  problemEditorView.hidden = false;
  setCurrentSection(fromMap ? mapsButton : problemsButton);
  renderProblemEditor();
  updateProblemSaveButton();
  problemPrompt.focus();
}

function closeProblemEditor() {
  if (!discardUnsavedProblem()) return;
  const mapId = openMapId;
  if (problemReturn === "map" && mapId && maps.some((map) => map.id === mapId)) {
    navigateTo(["maps", mapId]);
    return;
  }
  const problem = findProblem(editingProblemNo, editingProblemType);
  const type = problem ? problem.type : editingProblemType;
  if (problem) revealProblemInList(problem.index, problem.type);
  navigateTo(["problems", typeInfo(type) ? type : "math"]);
}

function revealProblemInList(index, type) {
  if (!typeInfo(type)) return;
  activeProblemType = type;
  problemQuery = "";
  problemDifficultyFilter = "all";
  problemSortMode = "index";
  if (problemSearch) problemSearch.value = "";
  const ordered = problems
    .filter((problem) => problem.type === type)
    .sort(compareProblems);
  const position = ordered.findIndex((problem) => problem.index === index);
  problemPage = position >= 0 ? Math.floor(position / PROBLEM_PAGE_SIZE) + 1 : 1;
}

function syncProblemRoute() {
  if (!ROUTED || !problemDraft) return;
  if (problemReturn === "map" && openMapId) {
    setHashSilently(["maps", openMapId, "problem", problemDraft.type, String(problemDraft.index)]);
    return;
  }
  setHashSilently(["problems", problemDraft.type, String(problemDraft.index)]);
}

function commitProblemIndex() {
  const next = readProblemNo(problemIndexInput.value);
  if (next === null) {
    problemIndexError.hidden = false;
    problemIndexError.textContent = `Index must be a whole number from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.`;
    problemIndexInput.value = String(editingProblemNo);
    return;
  }

  problemIndexError.hidden = true;
  if (next === editingProblemNo) return;
  if (problemDraft?.isNew) {
    if (findProblem(next, problemDraft.type)) {
      problemIndexError.hidden = false;
      problemIndexError.textContent = "That index already belongs to another problem.";
      problemIndexInput.value = String(problemDraft.index);
      return;
    }
    problemDraft.index = next;
    editingProblemNo = next;
    problemDirty = true;
    updateProblemSaveButton();
    renderProblemEditor();
    syncProblemRoute();
    return;
  }
  if (!reindexProblem(editingProblemNo, next)) {
    problemIndexInput.value = String(editingProblemNo);
    return;
  }

  editingProblemNo = next;
  if (problemDraft) problemDraft.index = next;
  syncProblemRoute();
  renderProblemEditor();
}

function reindexProblem(oldIndex, newIndex) {
  const moving = findProblem(oldIndex, editingProblemType);
  if (!moving) return false;

  const other = findProblem(newIndex, moving.type);
  if (other) {
    const movingTag = problemTag(oldIndex, moving.type);
    const otherTag = problemTag(newIndex, other.type);
    const movingNext = problemTag(newIndex, moving.type);
    const otherNext = problemTag(oldIndex, other.type);
    const typeName = typeInfo(moving.type).name;
    const swap = window.confirm(
      `${otherTag} already belongs to another ${typeName} problem. Swap these indexes? ${movingTag} becomes ${movingNext}, and ${otherTag} becomes ${otherNext}.`
    );
    if (!swap) return false;
    other.index = oldIndex;
    moving.index = newIndex;
    swapProblemNumbersOnMaps(oldIndex, newIndex, moving.type);
  } else {
    moving.index = newIndex;
    renameProblemOnMaps(oldIndex, newIndex, moving.type);
  }

  problems.sort(compareProblems);
  persistProblems();
  persistMaps();
  return true;
}

function renameProblemOnMaps(oldIndex, newIndex, type) {
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.type === type && cell.problemNo === oldIndex) {
        cell.problemNo = newIndex;
      }
    }
  }
}

function swapProblemNumbersOnMaps(first, second, type) {
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind !== "problem" || cell.type !== type) continue;
      if (cell.problemNo === first) cell.problemNo = second;
      else if (cell.problemNo === second) cell.problemNo = first;
    }
  }
}

function renameProblemTypeOnMaps(index, oldType, newType) {
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.problemNo === index && cell.type === oldType) {
        cell.type = newType;
      }
    }
  }
}

function swapProblemTypesOnMaps(index, firstType, secondType) {
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind !== "problem" || cell.problemNo !== index) continue;
      if (cell.type === firstType) cell.type = secondType;
      else if (cell.type === secondType) cell.type = firstType;
    }
  }
}

function setProblemType(index, type) {
  if (problemDraft?.isNew) {
    if (!typeInfo(type) || problemDraft.type === type) return;
    if (findProblem(problemDraft.index, type)) {
      problemIndexError.hidden = false;
      problemIndexError.textContent = "That index already belongs to another problem of this type.";
      return;
    }
    problemIndexError.hidden = true;
    problemDraft.type = type;
    editingProblemType = type;
    problemDirty = true;
    updateProblemSaveButton();
    renderProblemEditor();
    syncProblemRoute();
    return;
  }
  const problem = findProblem(index, editingProblemType);
  if (!problem || !typeInfo(type) || problem.type === type) return;

  const other = findProblem(problem.index, type);
  if (other) {
    const movingTag = problemTag(problem.index, problem.type);
    const otherTag = problemTag(other.index, other.type);
    const movingNext = problemTag(problem.index, type);
    const otherNext = problemTag(other.index, problem.type);
    const first = window.confirm(
      `${otherTag} already belongs to another ${typeInfo(type).name} problem. Swap types with ${movingTag}?`
    );
    if (!first) return;
    const second = window.confirm(
      `Swap these types? ${movingTag} becomes ${movingNext}, and ${otherTag} becomes ${otherNext}.`
    );
    if (!second) return;
    const oldType = problem.type;
    problem.type = type;
    other.type = oldType;
    swapProblemTypesOnMaps(problem.index, oldType, type);
  } else {
    const oldType = problem.type;
    problem.type = type;
    renameProblemTypeOnMaps(problem.index, oldType, type);
  }

  editingProblemType = type;
  if (problemDraft) problemDraft.type = type;
  problems.sort(compareProblems);
  persistProblems();
  persistMaps();
  if (problemEditorView.hidden) renderProblems();
  else {
    renderProblemEditor();
    syncProblemRoute();
  }
}

function setProblemDifficulty(difficulty) {
  if (!problemDraft || !DIFFICULTIES.includes(difficulty) || problemDraft.difficulty === difficulty) return;
  problemDraft.difficulty = difficulty;
  problemDirty = true;
  updateProblemSaveButton();
  renderProblemEditor();
}

function updateProblemField(field, value) {
  if (!problemDraft || (field !== "prompt" && field !== "answer" && field !== "logic")) return;
  problemDraft[field] = value;
  problemDirty = true;
  if (problemSaveError) problemSaveError.hidden = true;
  updateProblemSaveButton();
}

function deleteProblem(index, type) {
  const tag = problemTag(index, type);
  const usage = problemUsage(index, type);
  const where = usage.cells > 0
    ? `It is placed on ${usage.maps} map${usage.maps === 1 ? "" : "s"} in ${usage.cells} cell${usage.cells === 1 ? "" : "s"}, and those cells will be cleared.`
    : "It is not placed on any map.";
  if (!window.confirm(`Delete ${tag}?\n\n${where}`)) return;
  const wasOpen = editingProblemNo === index && editingProblemType === type;
  problems = problems.filter((problem) => !(problem.index === index && problem.type === type));
  for (const map of maps) {
    map.cells.forEach((cell, cellIndex) => {
      if (cell.kind === "problem" && cell.problemNo === index && cell.type === type) {
        map.cells[cellIndex] = { kind: "empty" };
      }
    });
  }
  if (wasOpen) {
    editingProblemNo = null;
    editingProblemType = null;
  }
  persistProblems();
  persistMaps();
  if (wasOpen) {
    if (problemReturn === "map" && openMapId) navigateTo(["maps", openMapId], { replace: true });
    else navigateTo(["problems", typeInfo(type) ? type : "math"], { replace: true });
  } else {
    renderProblems();
  }
}

function ensureProblem(index, type) {
  const problemType = typeInfo(type) ? type : "math";
  if (findProblem(index, problemType)) return;
  const problem = blankProblem(index);
  problem.type = problemType;
  problems.push(problem);
  problems.sort(compareProblems);
  persistProblems();
}

function compareProblems(a, b) {
  return a.index - b.index || a.type.localeCompare(b.type);
}

function problemUsage(index, type) {
  let cells = 0;
  const mapIds = new Set();
  for (const map of maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.problemNo === index && cell.type === type) {
        cells += 1;
        mapIds.add(map.id);
      }
    }
  }
  return { cells, maps: mapIds.size };
}

function plainProblemText(source) {
  return String(source || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function problemMatchesFilters(problem) {
  if (problemDifficultyFilter !== "all" && problemDifficulty(problem) !== problemDifficultyFilter) {
    return false;
  }
  const query = problemQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    problemTag(problem.index, problem.type),
    String(problem.index),
    plainProblemText(problem.prompt),
    plainProblemText(problem.answer),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function filteredProblems() {
  const items = problemsOfActiveType().filter(problemMatchesFilters);
  if (problemSortMode === "index-desc") {
    items.sort((a, b) => b.index - a.index || a.type.localeCompare(b.type));
  } else if (problemSortMode === "difficulty") {
    items.sort((a, b) => (
      DIFFICULTY_SCORE[problemDifficulty(b)] - DIFFICULTY_SCORE[problemDifficulty(a)]
      || compareProblems(a, b)
    ));
  } else {
    items.sort(compareProblems);
  }
  return items;
}

function pageNumbers(current, total) {
  const pages = new Set([1, total]);
  for (let page = current - 2; page <= current + 2; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }
  const ordered = [...pages].sort((a, b) => a - b);
  const result = [];
  let previous = 0;
  for (const page of ordered) {
    if (previous && page - previous > 1) result.push("…");
    result.push(page);
    previous = page;
  }
  return result;
}

function renderProblemPages(pageCount) {
  problemPages.replaceChildren();
  problemPages.hidden = pageCount <= 1;
  if (pageCount <= 1) return;

  const addButton = (label, page, options = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    if (page !== null) button.dataset.problemPage = String(page);
    button.textContent = label;
    if (options.current) button.setAttribute("aria-pressed", "true");
    if (options.disabled) button.disabled = true;
    problemPages.append(button);
  };

  addButton("‹ Prev", problemPage - 1, { disabled: problemPage <= 1 });
  for (const page of pageNumbers(problemPage, pageCount)) {
    if (page === "…") {
      const gap = document.createElement("span");
      gap.className = "page-gap";
      gap.textContent = "…";
      problemPages.append(gap);
    } else {
      addButton(String(page), page, { current: page === problemPage });
    }
  }
  addButton("Next ›", problemPage + 1, { disabled: problemPage >= pageCount });
}

function syncProblemTypeCounts() {
  if (!problemSectionChoices) return;
  for (const button of problemSectionChoices.querySelectorAll("[data-section]")) {
    const type = typeInfo(button.dataset.section);
    if (!type) continue;
    const count = problems.filter((problem) => problem.type === type.id).length;
    button.dataset.count = String(count);
    button.setAttribute("aria-label", `${type.name}, ${count} problem${count === 1 ? "" : "s"}`);
  }
}

function renderProblems() {
  if (problemSearch) problemQuery = problemSearch.value.trim();
  syncProblemTypeCounts();
  for (const button of problemSectionChoices.querySelectorAll("[data-section]")) {
    button.setAttribute("aria-pressed", String(button.dataset.section === activeProblemType));
  }

  const type = typeInfo(activeProblemType);
  if (!type) {
    problemSection.hidden = true;
    return;
  }

  syncProblemToolbar();
  const all = problems.filter((problem) => problem.type === type.id);
  const matching = filteredProblems();
  const pageCount = Math.max(1, Math.ceil(matching.length / PROBLEM_PAGE_SIZE));
  problemPage = Math.min(Math.max(1, problemPage), pageCount);
  const start = (problemPage - 1) * PROBLEM_PAGE_SIZE;
  const visible = matching.slice(start, start + PROBLEM_PAGE_SIZE);
  const filtering = Boolean(problemQuery.trim()) || problemDifficultyFilter !== "all";

  problemSection.hidden = false;
  problemSectionTitle.textContent = type.name;
  const tag = document.createElement("span");
  tag.className = "problem-tag";
  tag.textContent = type.tag;
  problemSectionTitle.append(tag);
  addProblemButton.setAttribute("aria-label", `Add ${type.name} problem`);
  renderProblemPages(pageCount);

  if (problemCount) {
    if (matching.length === 0) {
      problemCount.textContent = filtering ? `No matches in ${all.length} problem${all.length === 1 ? "" : "s"}` : "No problems yet";
    } else {
      const end = Math.min(start + visible.length, matching.length);
      problemCount.textContent = filtering
        ? `Showing ${start + 1}–${end} of ${matching.length} matches (${all.length} total)`
        : `Showing ${start + 1}–${end} of ${matching.length}`;
    }
  }

  if (all.length === 0) {
    problemSelectMode = false;
    selectedProblemKeys.clear();
  }
  problemSelectToggle.hidden = all.length === 0;
  problemSelectToggle.setAttribute("aria-pressed", String(problemSelectMode));
  problemSelectToggle.textContent = problemSelectMode ? "Done" : "Select";
  problemBulk.hidden = !problemSelectMode || all.length === 0;
  if (problemSelectAllLabel) problemSelectAllLabel.textContent = filtering ? "All results" : "All";

  problemEmpty.hidden = matching.length > 0;
  problemEmpty.textContent = all.length === 0
    ? `No ${type.name} problems yet.`
    : "No problems match this search and filter.";

  problemList.replaceChildren();
  for (const problem of visible) problemList.append(createProblemEntity(problem));
  problemList.hidden = visible.length === 0;
  pruneProblemSelection();
  syncProblemSelection(matching);
}

function problemKey(type, index) {
  return `${type}:${index}`;
}

function problemsOfActiveType() {
  if (!activeProblemType) return [];
  return problems.filter((problem) => problem.type === activeProblemType);
}

function selectedProblems() {
  return problemsOfActiveType().filter((problem) => selectedProblemKeys.has(problemKey(problem.type, problem.index)));
}

function pruneProblemSelection() {
  const live = new Set(problems.map((problem) => problemKey(problem.type, problem.index)));
  for (const key of selectedProblemKeys) {
    if (!live.has(key)) selectedProblemKeys.delete(key);
  }
}

function syncProblemSelection(matching = filteredProblems()) {
  const boxes = [...problemList.querySelectorAll("[data-select-problem]")];
  const selectedOnPage = boxes.filter((box) => box.checked).length;
  const chosen = selectedProblems();
  problemSelectPage.checked = boxes.length > 0 && selectedOnPage === boxes.length;
  problemSelectPage.indeterminate = selectedOnPage > 0 && selectedOnPage < boxes.length;
  problemSelectAll.checked = matching.length > 0 && chosen.length === matching.length;
  problemSelectAll.indeterminate = chosen.length > 0 && chosen.length < matching.length;
  problemSelectedCount.textContent = chosen.length === 0 ? "None selected" : `${chosen.length} selected`;
  const idle = chosen.length === 0;
  problemBulkDelete.disabled = idle;
  for (const button of problemBulkDifficulty.querySelectorAll("button")) button.disabled = idle;
}

function onProblemSelectionChange(event) {
  const box = event.target.closest("[data-select-problem]");
  if (!box) return;
  const key = problemKey(box.dataset.selectType, Number(box.dataset.selectProblem));
  if (box.checked) selectedProblemKeys.add(key);
  else selectedProblemKeys.delete(key);
  syncProblemSelection();
}

function selectProblemPage() {
  for (const box of problemList.querySelectorAll("[data-select-problem]")) {
    box.checked = problemSelectPage.checked;
    const key = problemKey(box.dataset.selectType, Number(box.dataset.selectProblem));
    if (box.checked) selectedProblemKeys.add(key);
    else selectedProblemKeys.delete(key);
  }
  syncProblemSelection();
}

function selectAllProblems() {
  for (const problem of filteredProblems()) {
    const key = problemKey(problem.type, problem.index);
    if (problemSelectAll.checked) selectedProblemKeys.add(key);
    else selectedProblemKeys.delete(key);
  }
  for (const box of problemList.querySelectorAll("[data-select-problem]")) {
    box.checked = problemSelectAll.checked;
  }
  syncProblemSelection();
}

function onBulkDifficultyClick(event) {
  const button = event.target.closest("[data-bulk-difficulty]");
  if (!button || button.disabled) return;
  const difficulty = button.dataset.bulkDifficulty;
  const chosen = selectedProblems();
  if (!DIFFICULTIES.includes(difficulty) || chosen.length === 0) return;
  const label = chosen.length === 1
    ? problemTag(chosen[0].index, chosen[0].type)
    : `${chosen.length} ${typeInfo(activeProblemType).name} problems`;
  if (!window.confirm(`Set ${label} to ${DIFFICULTY_NAME[difficulty]}?`)) return;
  for (const problem of chosen) problem.difficulty = difficulty;
  persistProblems();
  renderProblems();
}

function deleteSelectedProblems() {
  const chosen = selectedProblems();
  if (chosen.length === 0) return;
  const tags = chosen.slice(0, 8).map((problem) => problemTag(problem.index, problem.type));
  const tagText = tags.join(", ") + (chosen.length > tags.length ? ` and ${chosen.length - tags.length} more` : "");
  const pronoun = chosen.length === 1 ? "It" : "They";
  if (!window.confirm(`Delete ${chosen.length} problem${chosen.length === 1 ? "" : "s"}? ${tagText}.\n\n${pronoun} will also be cleared from every map.`)) return;
  const keys = new Set(chosen.map((problem) => problemKey(problem.type, problem.index)));
  problems = problems.filter((problem) => !keys.has(problemKey(problem.type, problem.index)));
  for (const map of maps) {
    map.cells.forEach((cell, cellIndex) => {
      if (cell.kind === "problem" && keys.has(problemKey(cell.type, cell.problemNo))) {
        map.cells[cellIndex] = { kind: "empty" };
      }
    });
  }
  for (const key of keys) selectedProblemKeys.delete(key);
  persistProblems();
  persistMaps();
  renderProblems();
}

function createProblemEntity(problem) {
  const item = document.createElement("li");
  const check = document.createElement("label");
  const checkbox = document.createElement("input");
  const openButton = document.createElement("button");
  const key = document.createElement("span");
  const difficulty = document.createElement("span");
  const snippet = document.createElement("span");
  const usage = document.createElement("span");
  const actions = document.createElement("div");
  const tag = problemTag(problem.index, problem.type);
  const level = problemDifficulty(problem);
  const usageInfo = problemUsage(problem.index, problem.type);

  item.className = problemSelectMode ? "problem-row selecting" : "problem-row";
  item.dataset.problemIndex = String(problem.index);
  if (problemSelectMode) {
    check.className = "problem-check";
    checkbox.type = "checkbox";
    checkbox.dataset.selectProblem = String(problem.index);
    checkbox.dataset.selectType = problem.type;
    checkbox.checked = selectedProblemKeys.has(problemKey(problem.type, problem.index));
    checkbox.setAttribute("aria-label", `Select ${tag}`);
    check.append(checkbox);
  }

  openButton.type = "button";
  openButton.className = "open-problem";
  openButton.dataset.openProblem = String(problem.index);
  openButton.dataset.openType = problem.type;
  openButton.setAttribute("aria-label", `Edit ${tag}`);
  key.className = `problem-key ${problem.type}`;
  key.textContent = tag;
  difficulty.className = `difficulty-chip ${level}`;
  difficulty.textContent = DIFFICULTY_NAME[level];
  snippet.className = "problem-snippet";
  snippet.textContent = problemSnippet(problem);
  renderMath(snippet);
  openButton.append(key, difficulty, snippet);

  usage.className = usageInfo.cells > 0 ? "problem-usage-chip" : "problem-usage-chip unused";
  usage.textContent = usageInfo.cells > 0
    ? `${usageInfo.maps} map${usageInfo.maps === 1 ? "" : "s"} · ${usageInfo.cells} cell${usageInfo.cells === 1 ? "" : "s"}`
    : "Not placed";
  usage.setAttribute("aria-label", usageInfo.cells > 0
    ? `Used on ${usageInfo.maps} map${usageInfo.maps === 1 ? "" : "s"} in ${usageInfo.cells} cell${usageInfo.cells === 1 ? "" : "s"}`
    : "Not placed on any map");

  if (problemSelectMode) {
    const main = document.createElement("div");
    main.className = "problem-row-main";
    main.append(check, openButton);
    item.append(main, usage);
  } else {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "account-action";
    editButton.dataset.openProblem = String(problem.index);
    editButton.dataset.openType = problem.type;
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${tag}`);

    const duplicateButton = document.createElement("button");
    duplicateButton.type = "button";
    duplicateButton.className = "account-action";
    duplicateButton.dataset.duplicateProblem = String(problem.index);
    duplicateButton.dataset.duplicateType = problem.type;
    duplicateButton.textContent = "Duplicate";
    duplicateButton.setAttribute("aria-label", `Duplicate ${tag}`);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "account-action danger";
    deleteButton.dataset.deleteProblem = String(problem.index);
    deleteButton.dataset.deleteType = problem.type;
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${tag}`);

    actions.className = "problem-row-actions";
    actions.append(editButton, duplicateButton, deleteButton);
    const main = document.createElement("div");
    main.className = "problem-row-main";
    main.append(openButton, actions);
    item.append(main, usage);
  }
  return item;
}

const MATH_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "$", right: "$", display: false },
  { left: "\\(", right: "\\)", display: false },
];

function renderMath(element) {
  if (!element || typeof renderMathInElement !== "function") return;
  const text = element.textContent || "";
  if (!text.includes("$") && !text.includes("\\")) return;
  try {
    renderMathInElement(element, {
      delimiters: MATH_DELIMITERS,
      throwOnError: false,
      strict: "ignore",
    });
  } catch (error) {
    console.error("[math]", error);
  }
}

function containsHtml(source) {
  return /<\/?[a-z][\w:-]*\b[^>]*>/i.test(source);
}


const STATEMENT_KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css";
const STATEMENT_KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js";
const STATEMENT_AUTO_RENDER_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js";
const statementFrames = new WeakMap();

function escapeStatementText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let activeStudentStatementFrame = null;
let pendingStatementSubmit = null;

function buildStatementDocument(source, tag = "") {
  const text = String(source || "");
  const tagText = escapeStatementText(tag);
  const body = containsHtml(text)
    ? text
    : `<pre class="statement-text">${escapeStatementText(text)}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${STATEMENT_KATEX_CSS}" crossorigin="anonymous">
<style>
  html, body { margin: 0; padding: 0; background: #081220; color: #d7f6ff; }
  body { font-family: "Share Tech Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 16px; line-height: 1.55; }
  #territory-bridge { display: none; }
  .statement-content { overflow-wrap: anywhere; font-size: 16px; }
  .katex { font-size: 1em; }
  .statement-content pre { margin: 0; white-space: pre-wrap; overflow: auto; }
  .statement-content img, .statement-content video,
  .statement-content canvas, .statement-content svg { max-width: 100%; height: auto; }
  .statement-content table { max-width: 100%; border-collapse: collapse; }
  .statement-content a { color: #3ee0ff; }
</style>
<script src="${STATEMENT_KATEX_JS}" crossorigin="anonymous"></script>
<script src="${STATEMENT_AUTO_RENDER_JS}" crossorigin="anonymous"></script>
<script>
(function () {
  function report() {
    try {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ type: "territory-statement-height", height: height }, "*");
    } catch (error) {}
  }
  function renderMath() {
    if (typeof renderMathInElement !== "function") return;
    try {
      renderMathInElement(document.querySelector(".statement-content"), {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\\\[", right: "\\\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\\\(", right: "\\\\)", display: false }
        ],
        throwOnError: false,
        strict: "ignore"
      });
    } catch (error) {}
  }
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    renderMath();
    report();
    try {
      if (window.ResizeObserver) new ResizeObserver(report).observe(document.documentElement);
    } catch (error) {}
    try {
      new MutationObserver(report).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    } catch (error) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("load", boot);
})();
</script>
</head><body>
<div id="territory-bridge" aria-hidden="true">
  <span id="student-problem-tag">${tagText}</span>
  <form id="student-answer-form"><button type="submit">Submit</button></form>
  <input id="student-answer" type="text" />
  <p id="student-answer-error" hidden></p>
</div>
<script>
(function () {
  var input = document.getElementById("student-answer");
  var form = document.getElementById("student-answer-form");
  var err = document.getElementById("student-answer-error");
  if (!input || !form || !err) return;
  var answer = "";
  var readOnly = false;
  var errorHidden = true;
  var errorText = "";
  function post(type, data) {
    try {
      var message = { type: type };
      if (data) for (var key in data) if (Object.prototype.hasOwnProperty.call(data, key)) message[key] = data[key];
      parent.postMessage(message, "*");
    } catch (error) {}
  }
  Object.defineProperty(input, "value", {
    get: function () { return answer; },
    set: function (next) { answer = String(next == null ? "" : next); post("territory-answer-value", { value: answer }); }
  });
  var styleProxy = {};
  Object.defineProperty(styleProxy, "cssText", {
    get: function () { return input.getAttribute("style") || ""; },
    set: function (next) {
      var css = String(next == null ? "" : next);
      input.setAttribute("style", css);
      post("territory-answer-style", { cssText: css });
    }
  });
  Object.defineProperty(input, "style", { get: function () { return styleProxy; } });
  Object.defineProperty(input, "readOnly", {
    get: function () { return readOnly; },
    set: function (next) {
      readOnly = !!next;
      if (readOnly) input.setAttribute("readonly", "readonly");
      else input.removeAttribute("readonly");
      post("territory-answer-readonly", { readOnly: readOnly });
    }
  });
  function postError() { post("territory-answer-error", { hidden: errorHidden, text: errorText }); }
  Object.defineProperty(err, "hidden", {
    get: function () { return errorHidden; },
    set: function (next) { errorHidden = !!next; postError(); }
  });
  Object.defineProperty(err, "textContent", {
    get: function () { return errorText; },
    set: function (next) { errorText = String(next == null ? "" : next); postError(); }
  });
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "territory-before-submit") return;
    var blocked = false;
    var button = form.querySelector("button");
    if (button) {
      var click = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      button.dispatchEvent(click);
      blocked = click.defaultPrevented;
    }
    post("territory-submit-result", { id: data.id, blocked: blocked, message: errorHidden ? "" : errorText });
  });
})();
</script>
<div class="statement-content">${body}</div>
</body></html>`;
}

// Problem HTML runs in a sandboxed iframe. It may use its own scripts and the
// hidden answer bridge, but it cannot reach the parent page or close button.
function setRichText(element, source, options = {}) {
  const text = String(source || "");
  element.replaceChildren();
  element.classList.add("rich-html", "isolated-statement");
  const frame = document.createElement("iframe");
  frame.className = "statement-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("title", "Problem statement");
  frame.style.height = "120px";
  frame.srcdoc = buildStatementDocument(text, options.tag || "");
  element.append(frame);
  if (frame.contentWindow) statementFrames.set(frame.contentWindow, frame);
  return frame;
}

function approveStatementSubmit() {
  const frame = activeStudentStatementFrame;
  if (!frame || !frame.contentWindow) return Promise.resolve({ blocked: false, message: "" });
  if (pendingStatementSubmit) {
    clearTimeout(pendingStatementSubmit.timer);
    pendingStatementSubmit.resolve({ blocked: false, message: "" });
    pendingStatementSubmit = null;
  }
  return new Promise((resolve) => {
    const id = `statement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      if (pendingStatementSubmit && pendingStatementSubmit.id === id) {
        pendingStatementSubmit = null;
        resolve({ blocked: false, message: "" });
      }
    }, 300);
    pendingStatementSubmit = {
      id,
      timer,
      resolve: (result) => { clearTimeout(timer); resolve(result); },
    };
    try {
      frame.contentWindow.postMessage({ type: "territory-before-submit", id }, "*");
    } catch (error) {
      clearTimeout(timer);
      pendingStatementSubmit = null;
      resolve({ blocked: false, message: "" });
    }
  });
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;
  const frame = statementFrames.get(event.source);
  if (!frame) return;
  if (data.type === "territory-statement-height") {
    const height = Number(data.height);
    if (!Number.isFinite(height)) return;
    frame.style.height = `${Math.max(48, Math.min(8000, Math.ceil(height)))}px`;
    return;
  }
  if (frame !== activeStudentStatementFrame) return;
  if (data.type === "territory-answer-value" && studentAnswer) {
    studentAnswer.value = String(data.value == null ? "" : data.value);
  } else if (data.type === "territory-answer-style" && studentAnswer) {
    studentAnswer.style.cssText = String(data.cssText == null ? "" : data.cssText);
  } else if (data.type === "territory-answer-readonly" && studentAnswer) {
    studentAnswer.readOnly = data.readOnly === true;
  } else if (data.type === "territory-answer-error" && studentAnswerError) {
    studentAnswerError.hidden = data.hidden === true;
    studentAnswerError.textContent = String(data.text == null ? "" : data.text);
  } else if (data.type === "territory-submit-result" && pendingStatementSubmit && pendingStatementSubmit.id === data.id) {
    const pending = pendingStatementSubmit;
    pendingStatementSubmit = null;
    clearTimeout(pending.timer);
    pending.resolve({
      blocked: data.blocked === true,
      message: String(data.message == null ? "" : data.message),
    });
  }
});
function problemSnippet(problem) {
  const raw = (problem.prompt || "").trim();
  if (!raw) return "No text yet";
  // Strip tags for list display
  const div = document.createElement("div");
  div.innerHTML = raw;
  div.querySelectorAll("script, style").forEach((node) => node.remove());
  const text = (div.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return "(empty)";
  return text;
}

function renderProblemEditor() {
  const problem = problemDraft;
  if (!problem) {
    showProblems();
    setHashSilently(editingProblemType ? ["problems", editingProblemType] : "problems");
    return;
  }

  const tag = problemTag(problem.index, problem.type);
  problemEditorTitle.textContent = tag;
  problemBackButton.textContent = problemReturn === "map" ? "Back to map" : "Back to problems";
  deleteOpenProblemButton.setAttribute("aria-label", `Delete ${tag}`);
  if (problemUsageNote) {
    const usage = problemUsage(problem.index, problem.type);
    problemUsageNote.hidden = false;
    problemUsageNote.textContent = usage.cells > 0
      ? `This problem is placed on ${usage.maps} map${usage.maps === 1 ? "" : "s"} in ${usage.cells} cell${usage.cells === 1 ? "" : "s"}. Deleting it also clears those cells.`
      : "This problem is not placed on any map yet.";
  }
  const fromMap = problemReturn === "map";
  problemIndexField.hidden = fromMap;
  problemIndexNote.hidden = fromMap;
  problemTypeChoices.hidden = fromMap;
  problemIndexInput.value = String(problem.index);
  problemIndexError.hidden = true;
  for (const button of problemTypeChoices.querySelectorAll("[data-problem-type]")) {
    button.setAttribute("aria-pressed", String(button.dataset.problemType === problem.type));
  }
  const difficulty = problemDifficulty(problem);
  for (const button of problemDifficultyChoices.querySelectorAll("[data-problem-difficulty]")) {
    button.setAttribute("aria-pressed", String(button.dataset.problemDifficulty === difficulty));
  }
  problemPrompt.value = problem.prompt;
  problemAnswer.value = problem.answer;
  problemLogic.value = problem.logic || "";

  updateProblemSaveButton();
  // Render HTML preview
  requestAnimationFrame(renderProblemPreview);
}


