import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { api } from "../shared/api.js";
import { el } from "../shared/dom.js";
import { MIN_PROBLEM_NO, MAX_PROBLEM_NO, DIFFICULTIES, DIFFICULTY_NAME } from "../shared/constants.js";
import { typeInfo, problemDifficulty, problemTag } from "../shared/difficulty.js";
import { createStatementView } from "../shared/statement.js";

// ── 顶层常量 ─────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const index = Number(params.get("index"));
const type = params.get("type");
const fromMap = params.get("from") === "map";
const mapId = params.get("map");

// ── DOM ─────────────────────────────────────────────────
const form = document.querySelector("#problem-editor-form");
const titleEl = document.querySelector("#problem-editor-title");
const indexInput = document.querySelector("#problem-index-input");
const indexError = document.querySelector("#problem-index-error");
const promptEl = document.querySelector("#problem-prompt");
const answerEl = document.querySelector("#problem-answer");
const solutionEl = document.querySelector("#problem-solution");
const logicEl = document.querySelector("#problem-logic");
const saveError = document.querySelector("#problem-save-error");
const saveState = document.querySelector("#problem-save-state");
const saveBtn = document.querySelector("#save-problem-button");
const saveTop = document.querySelector("#save-problem-top");
const usageEl = document.querySelector("#problem-usage");

// ── 状态 ─────────────────────────────────────────────────
const state = {
  problems: [],
  maps: [],
  revisions: { problems: 0, maps: 0 },
  draft: null,
  dirty: false,
};

// ── Preview ─────────────────────────────────────────────
const previewEl = document.createElement("div");
previewEl.className = "problem-preview";
form.appendChild(previewEl);

// ── 函数 ─────────────────────────────────────────────────
async function run() {
  if (!Number.isInteger(index) || !typeInfo(type)) throw new Error("Invalid problem link.");
  const data = await loadBootstrap();
  state.problems = data.problems;
  state.maps = data.maps;
  state.revisions = data.revisions;

  const existing = state.problems.find((p) => p.index === index && p.type === type);
  state.draft = existing
    ? { ...existing, isNew: false }
    : { index, type, prompt: "", answer: "", solution: "", logic: "", difficulty: "normal", isNew: true };
  state.dirty = false;

  titleEl.textContent = problemTag(index, type);
  document.querySelector("#problem-back-button").textContent = fromMap ? "Back to map" : "Back to problems";
  document.querySelector("#problem-back-button").href = fromMap && mapId
    ? `/admin/map-editor.html?map=${encodeURIComponent(mapId)}`
    : `/admin/problems.html?type=${encodeURIComponent(type)}`;

  render();
  bindEvents();
  requestAnimationFrame(renderPreview);
}

function render() {
  const draft = state.draft;
  const fromMapView = fromMap && mapId;
  document.querySelector("#problem-index-field").hidden = fromMapView;
  document.querySelector("#problem-type-choices").hidden = fromMapView;

  indexInput.value = String(draft.index);
  indexError.hidden = true;

  for (const btn of document.querySelectorAll("[data-problem-type]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.problemType === draft.type));
  }
  for (const btn of document.querySelectorAll("[data-problem-difficulty]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.problemDifficulty === draft.difficulty));
  }

  promptEl.value = draft.prompt;
  answerEl.value = draft.answer;
  solutionEl.value = draft.solution || "";
  logicEl.value = draft.logic || "";

  const usage = problemUsage(draft.index, draft.type);
  usageEl.textContent = usage.cells > 0
    ? `This problem is placed on ${usage.maps} map${usage.maps === 1 ? "" : "s"} in ${usage.cells} cell${usage.cells === 1 ? "" : "s"}.`
    : "This problem is not placed on any map yet.";

  updateSaveState();
}

function bindEvents() {
  form?.addEventListener("submit", (e) => e.preventDefault());

  indexInput?.addEventListener("change", () => commitIndex());
  indexInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); indexInput.blur(); }
  });

  document.querySelector("#problem-type-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-problem-type]");
    if (!btn) return;
    setType(btn.dataset.problemType);
  });

  document.querySelector("#problem-difficulty-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-problem-difficulty]");
    if (!btn) return;
    if (!DIFFICULTIES.includes(btn.dataset.problemDifficulty)) return;
    state.draft.difficulty = btn.dataset.problemDifficulty;
    state.dirty = true;
    updateSaveState();
    render();
  });

  promptEl?.addEventListener("input", () => {
    state.draft.prompt = promptEl.value;
    state.dirty = true;
    updateSaveState();
    requestAnimationFrame(renderPreview);
  });
  answerEl?.addEventListener("input", () => {
    state.draft.answer = answerEl.value;
    state.dirty = true;
    updateSaveState();
    requestAnimationFrame(renderPreview);
  });
  solutionEl?.addEventListener("input", () => {
    state.draft.solution = solutionEl.value;
    state.dirty = true;
    updateSaveState();
    requestAnimationFrame(renderPreview);
  });
  logicEl?.addEventListener("input", () => {
    state.draft.logic = logicEl.value;
    state.dirty = true;
    updateSaveState();
  });

  saveBtn?.addEventListener("click", save);
  saveTop?.addEventListener("click", save);

  document.querySelector("#delete-open-problem")?.addEventListener("click", deleteProblem);
  document.querySelector("#duplicate-open-problem")?.addEventListener("click", duplicateProblem);

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
    e.preventDefault();
    save();
  });
}

function commitIndex() {
  const next = Number(indexInput.value);
  if (!Number.isInteger(next) || next < MIN_PROBLEM_NO || next > MAX_PROBLEM_NO) {
    indexError.hidden = false;
    indexError.textContent = `Index must be a whole number from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.`;
    indexInput.value = String(state.draft.index);
    return;
  }
  if (next === state.draft.index) return;
  if (state.draft.isNew) {
    if (state.problems.some((p) => p.index === next && p.type === state.draft.type)) {
      indexError.hidden = false;
      indexError.textContent = "That index already belongs to another problem.";
      indexInput.value = String(state.draft.index);
      return;
    }
    state.draft.index = next;
    state.dirty = true;
    history.replaceState(null, "", `/admin/problem-editor.html?type=${encodeURIComponent(state.draft.type)}&index=${next}${fromMap ? `&from=map&map=${encodeURIComponent(mapId)}` : ""}`);
    render();
    return;
  }
  if (!reindexProblem(state.draft.index, next)) {
    indexInput.value = String(state.draft.index);
    return;
  }
  state.draft.index = next;
  history.replaceState(null, "", `/admin/problem-editor.html?type=${encodeURIComponent(state.draft.type)}&index=${next}${fromMap ? `&from=map&map=${encodeURIComponent(mapId)}` : ""}`);
  render();
}

function reindexProblem(oldIndex, newIndex) {
  const moving = state.problems.find((p) => p.index === oldIndex && p.type === state.draft.type);
  if (!moving) return false;
  const other = state.problems.find((p) => p.index === newIndex && p.type === moving.type);
  if (other) {
    if (!window.confirm(`Swap with ${problemTag(newIndex, other.type)}?`)) return false;
    other.index = oldIndex;
    moving.index = newIndex;
    swapOnMaps(oldIndex, newIndex, moving.type);
  } else {
    moving.index = newIndex;
    renameOnMaps(oldIndex, newIndex, moving.type);
  }
  state.problems.sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));
  persistProblems();
  persistMaps();
  return true;
}

function swapOnMaps(first, second, type) {
  for (const map of state.maps) {
    for (const cell of map.cells) {
      if (cell.kind !== "problem" || cell.type !== type) continue;
      if (cell.problemNo === first) cell.problemNo = second;
      else if (cell.problemNo === second) cell.problemNo = first;
    }
  }
}

function renameOnMaps(oldIndex, newIndex, type) {
  for (const map of state.maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.type === type && cell.problemNo === oldIndex) cell.problemNo = newIndex;
    }
  }
}

function setType(nextType) {
  if (!typeInfo(nextType) || state.draft.type === nextType) return;
  const draft = state.draft;
  if (draft.isNew) {
    if (state.problems.some((p) => p.index === draft.index && p.type === nextType)) {
      indexError.hidden = false;
      indexError.textContent = "That index already belongs to another problem of this type.";
      return;
    }
    draft.type = nextType;
  } else {
    const problem = state.problems.find((p) => p.index === draft.index && p.type === draft.type);
    if (!problem) return;
    const other = state.problems.find((p) => p.index === problem.index && p.type === nextType);
    if (other) {
      if (!window.confirm(`Swap types with ${problemTag(other.index, other.type)}?`)) return;
      const oldType = problem.type;
      problem.type = nextType;
      other.type = oldType;
      swapTypesOnMaps(problem.index, oldType, nextType);
    } else {
      const oldType = problem.type;
      problem.type = nextType;
      renameTypeOnMaps(problem.index, oldType, nextType);
    }
    draft.type = nextType;
    state.problems.sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));
    persistProblems();
    persistMaps();
  }
  state.dirty = true;
  history.replaceState(null, "", `/admin/problem-editor.html?type=${encodeURIComponent(draft.type)}&index=${draft.index}${fromMap ? `&from=map&map=${encodeURIComponent(mapId)}` : ""}`);
  render();
}

function swapTypesOnMaps(index, first, second) {
  for (const map of state.maps) {
    for (const cell of map.cells) {
      if (cell.kind !== "problem" || cell.problemNo !== index) continue;
      if (cell.type === first) cell.type = second;
      else if (cell.type === second) cell.type = first;
    }
  }
}

function renameTypeOnMaps(index, oldType, newType) {
  for (const map of state.maps) {
    for (const cell of map.cells) {
      if (cell.kind === "problem" && cell.problemNo === index && cell.type === oldType) cell.type = newType;
    }
  }
}

function problemUsage(index, type) {
  let cells = 0;
  const mapIds = new Set();
  for (const map of state.maps) {
    for (const c of map.cells || []) {
      if (c.kind === "problem" && c.problemNo === index && c.type === type) {
        cells += 1;
        mapIds.add(map.id);
      }
    }
  }
  return { cells, maps: mapIds.size };
}

function updateSaveState() {
  const draft = state.draft;
  const saveable = Boolean(draft && (draft.isNew || state.dirty));
  if (saveBtn) saveBtn.disabled = !saveable;
  if (saveTop) saveTop.disabled = !saveable;
  if (!saveState) return;
  if (state.dirty) { saveState.textContent = "Unsaved changes"; saveState.dataset.state = "dirty"; }
  else if (draft?.isNew) { saveState.textContent = "New problem — not saved yet"; saveState.dataset.state = "new"; }
  else { saveState.textContent = "Saved"; saveState.dataset.state = "saved"; }
}

function renderPreview() {
  previewEl.replaceChildren();
  const promptHtml = (promptEl.value || "").trim();
  const answerHtml = (answerEl.value || "").trim();
  const solutionHtml = (solutionEl.value || "").trim();
  if (!promptHtml && !answerHtml && !solutionHtml) { previewEl.hidden = true; return; }
  previewEl.hidden = false;

  const box = el("div", "problem-preview-box");
  previewEl.append(box);

  if (promptHtml) {
    const title = el("div", "problem-preview-title", "Prompt — preview");
    const content = el("div", "problem-preview-content");
    box.append(title, content);
    createStatementView(content, {}).render(promptHtml);
  }
  if (answerHtml) {
    const title = el("div", "problem-preview-title", "Answer — preview");
    const content = el("div", "problem-preview-content");
    box.append(title, content);
    createStatementView(content, {}).render(answerHtml);
  }
  if (solutionHtml) {
    const title = el("div", "problem-preview-title", "Solution — preview");
    const content = el("div", "problem-preview-content");
    box.append(title, content);
    createStatementView(content, {}).render(solutionHtml);
  }
}

async function save() {
  const draft = state.draft;
  if (!draft) return;
  const prompt = promptEl.value;
  const answer = answerEl.value;
  const solution = solutionEl.value;
  const logic = logicEl.value;
  draft.prompt = prompt;
  draft.answer = answer;
  draft.solution = solution;
  draft.logic = logic;

  if (!prompt.trim() || !answer.trim()) {
    saveError.hidden = false;
    saveError.textContent = "Add both a question and an answer before saving.";
    return;
  }
  saveError.hidden = true;

  let problem = state.problems.find((p) => p.index === draft.index && p.type === draft.type);
  if (!problem) {
    problem = { index: draft.index, type: draft.type, prompt, answer, solution, logic, difficulty: draft.difficulty };
    state.problems.push(problem);
    state.problems.sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));
  } else {
    problem.prompt = prompt;
    problem.answer = answer;
    problem.solution = solution;
    problem.logic = logic;
    problem.difficulty = draft.difficulty;
  }
  draft.isNew = false;
  state.dirty = false;
  updateSaveState();

  const ok = await persistProblems();
  if (ok) showPageToast("Problem saved.", "ok");
}

async function persistProblems() {
  try {
    const data = await api.saveProblems(state.problems, state.revisions.problems);
    state.revisions.problems = data.revision;
    return true;
  } catch (err) {
    showPageToast(err.message || "Could not save problems.", "warn");
    state.dirty = true;
    updateSaveState();
    return false;
  }
}

async function persistMaps() {
  try {
    const data = await api.saveMaps(state.maps, state.revisions.maps);
    state.revisions.maps = data.revision;
    return true;
  } catch (err) {
    showPageToast(err.message || "Could not save maps.", "warn");
    return false;
  }
}

function deleteProblem() {
  const draft = state.draft;
  if (!draft) return;
  if (draft.isNew && !state.problems.some((p) => p.index === draft.index && p.type === draft.type)) {
    location.assign(fromMap && mapId
      ? `/admin/map-editor.html?map=${encodeURIComponent(mapId)}`
      : `/admin/problems.html?type=${encodeURIComponent(draft.type)}`);
    return;
  }
  const tag = problemTag(draft.index, draft.type);
  if (!window.confirm(`Delete ${tag}?`)) return;
  state.problems = state.problems.filter((p) => !(p.index === draft.index && p.type === draft.type));
  for (const map of state.maps) {
    map.cells.forEach((cell, i) => {
      if (cell.kind === "problem" && cell.problemNo === draft.index && cell.type === draft.type) {
        map.cells[i] = { kind: "empty" };
      }
    });
  }
  persistProblems().then(() => persistMaps()).then(() => {
    location.assign(fromMap && mapId
      ? `/admin/map-editor.html?map=${encodeURIComponent(mapId)}`
      : `/admin/problems.html?type=${encodeURIComponent(draft.type)}`);
  });
}

async function duplicateProblem() {
  const draft = state.draft;
  if (!draft) return;
  if (draft.isNew || state.dirty) {
    await save();
    if (state.dirty) return;
  }
  const nextIndex = nextProblemNo(draft.type);
  if (nextIndex === null) { showPageToast("No free index.", "warn"); return; }
  const copy = { ...state.problems.find((p) => p.index === draft.index && p.type === draft.type) };
  copy.index = nextIndex;
  state.problems.push(copy);
  state.problems.sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));
  await persistProblems();
  location.assign(`/admin/problem-editor.html?type=${encodeURIComponent(copy.type)}&index=${nextIndex}`);
}

function nextProblemNo(pType) {
  const used = new Set();
  for (const p of state.problems) if (p.type === pType) used.add(p.index);
  for (const map of state.maps) for (const c of map.cells || []) {
    if (c?.kind === "problem" && c.type === pType) used.add(c.problemNo);
  }
  for (let i = 26000; i <= 26999; i += 1) {
    if (!used.has(i)) return i;
  }
  return null;
}

// ── 启动（最后） ─────────────────────────────────────────
if (requireAdmin()) {
  initNav("problems");
  bindToastClose();
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message || "Could not open the problem."; }
  });
}