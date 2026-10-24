import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { el } from "../shared/dom.js";
import { MIN_PROBLEM_NO, MAX_PROBLEM_NO, DIFFICULTIES, DIFFICULTY_NAME, MAX_PROBLEM_SCORE } from "../shared/constants.js";
import { typeInfo, problemDifficulty, problemTag, problemScore, difficultyScore } from "../shared/difficulty.js";
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
const scoreEl = document.querySelector("#problem-score");
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
  keys: [],
  reserved: [],
  usage: { cells: 0, maps: 0 },
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
  const data = await loadPage("page-problem", { type, index });
  state.keys = data.keys || [];
  state.reserved = data.reserved || [];
  state.usage = data.usage || { cells: 0, maps: 0 };
  state.revisions = data.revisions;

  const existing = data.problem;
  state.draft = existing
    ? { ...existing, isNew: false }
    : { index, type, prompt: "", answer: "", solution: "", logic: "", difficulty: "normal", score: difficultyScore("normal"), isNew: true };
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

  if (scoreEl) scoreEl.value = String(problemScore(draft));
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
    const nextDifficulty = btn.dataset.problemDifficulty;
    if (!DIFFICULTIES.includes(nextDifficulty) || nextDifficulty === state.draft.difficulty) return;
    const wasDefault = problemScore(state.draft) === difficultyScore(state.draft.difficulty);
    state.draft.difficulty = nextDifficulty;
    if (wasDefault) state.draft.score = difficultyScore(nextDifficulty);
    state.dirty = true;
    updateSaveState();
    render();
  });

  scoreEl?.addEventListener("input", () => {
    const n = Number(scoreEl.value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PROBLEM_SCORE) return;
    state.draft.score = n;
    state.dirty = true;
    updateSaveState();
  });
  scoreEl?.addEventListener("change", () => {
    const n = Number(scoreEl.value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PROBLEM_SCORE) {
      scoreEl.value = String(problemScore(state.draft));
      return;
    }
    state.draft.score = n;
    state.dirty = true;
    updateSaveState();
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
    if (state.keys.some((p) => p.index === next && p.type === state.draft.type)) {
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
  const typeName = state.draft.type;
  const moving = state.keys.find((p) => p.index === oldIndex && p.type === typeName);
  if (!moving) return false;
  const other = state.keys.find((p) => p.index === newIndex && p.type === typeName);
  if (other && !window.confirm(`Swap with ${problemTag(newIndex, other.type)}?`)) return false;
  moveProblem({ type: typeName, index: oldIndex }, { type: typeName, index: newIndex }).then((ok) => {
    if (ok) return;
    state.draft.index = oldIndex;
    indexInput.value = String(oldIndex);
    history.replaceState(null, "", `/admin/problem-editor.html?type=${encodeURIComponent(typeName)}&index=${oldIndex}${fromMap ? `&from=map&map=${encodeURIComponent(mapId)}` : ""}`);
    render();
  });
  return true;
}

function setType(nextType) {
  if (!typeInfo(nextType) || state.draft.type === nextType) return;
  const draft = state.draft;
  if (draft.isNew) {
    if (state.keys.some((p) => p.index === draft.index && p.type === nextType)) {
      indexError.hidden = false;
      indexError.textContent = "That index already belongs to another problem of this type.";
      return;
    }
    draft.type = nextType;
  } else {
    const problem = state.keys.find((p) => p.index === draft.index && p.type === draft.type);
    if (!problem) return;
    const other = state.keys.find((p) => p.index === problem.index && p.type === nextType);
    if (other && !window.confirm(`Swap types with ${problemTag(other.index, other.type)}?`)) return;
    const oldType = problem.type;
    const keptIndex = problem.index;
    moveProblem({ type: oldType, index: keptIndex }, { type: nextType, index: keptIndex }).then((ok) => {
      if (ok) return;
      draft.type = oldType;
      history.replaceState(null, "", `/admin/problem-editor.html?type=${encodeURIComponent(oldType)}&index=${keptIndex}${fromMap ? `&from=map&map=${encodeURIComponent(mapId)}` : ""}`);
      render();
    });
    draft.type = nextType;
  }
  state.dirty = true;
  history.replaceState(null, "", `/admin/problem-editor.html?type=${encodeURIComponent(draft.type)}&index=${draft.index}${fromMap ? `&from=map&map=${encodeURIComponent(mapId)}` : ""}`);
  render();
}

async function moveProblem(from, to) {
  try {
    const data = await api.moveProblem(from, to, state.revisions.problems);
    state.revisions.problems = data.revision;
    const moving = state.keys.find((p) => p.type === from.type && p.index === from.index);
    const other = state.keys.find((p) => p.type === to.type && p.index === to.index);
    if (moving && other && other !== moving) {
      moving.type = to.type;
      moving.index = to.index;
      other.type = from.type;
      other.index = from.index;
    } else if (moving) {
      moving.type = to.type;
      moving.index = to.index;
    }
    return true;
  } catch (err) {
    showPageToast(err.message || "Could not move that problem.", "warn");
    return false;
  }
}

function problemUsage() {
  return state.usage || { cells: 0, maps: 0 };
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
  const score = Number(scoreEl.value);
  draft.prompt = prompt;
  draft.answer = answer;
  draft.solution = solution;
  draft.logic = logic;

  if (!Number.isInteger(score) || score < 0 || score > MAX_PROBLEM_SCORE) {
    saveError.hidden = false;
    saveError.textContent = `Score must be a whole number from 0 to ${MAX_PROBLEM_SCORE}.`;
    return;
  }
  draft.score = score;

  if (!prompt.trim() || !answer.trim()) {
    saveError.hidden = false;
    saveError.textContent = "Add both a question and an answer before saving.";
    return;
  }
  saveError.hidden = true;

  const problem = {
    index: draft.index,
    type: draft.type,
    prompt,
    answer,
    solution,
    logic,
    difficulty: draft.difficulty,
    score,
  };
  draft.isNew = false;
  state.dirty = false;
  updateSaveState();
  if (!state.keys.some((p) => p.index === problem.index && p.type === problem.type)) {
    state.keys.push({ index: problem.index, type: problem.type });
  }

  try {
    const data = await api.saveProblem(problem, state.revisions.problems);
    state.revisions.problems = data.revision;
    showPageToast("Problem saved.", "ok");
  } catch (err) {
    showPageToast(err.message || "Could not save the problem.", "warn");
    state.dirty = true;
    draft.isNew = !state.keys.some((p) => p.index === draft.index && p.type === draft.type);
    updateSaveState();
  }
}

function deleteProblem() {
  const draft = state.draft;
  if (!draft) return;
  const back = fromMap && mapId
    ? `/admin/map-editor.html?map=${encodeURIComponent(mapId)}`
    : `/admin/problems.html?type=${encodeURIComponent(draft.type)}`;
  if (draft.isNew && !state.keys.some((p) => p.index === draft.index && p.type === draft.type)) {
    location.assign(back);
    return;
  }
  const tag = problemTag(draft.index, draft.type);
  if (!window.confirm(`Delete ${tag}?`)) return;
  api.deleteProblems([{ type: draft.type, index: draft.index }], state.revisions.problems).then(() => {
    location.assign(back);
  }).catch((err) => showPageToast(err.message || "Could not delete the problem.", "warn"));
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
  const copy = {
    index: nextIndex,
    type: draft.type,
    prompt: draft.prompt,
    answer: draft.answer,
    solution: draft.solution,
    logic: draft.logic,
    difficulty: draft.difficulty,
    score: draft.score,
  };
  try {
    await api.saveProblem(copy, state.revisions.problems);
  } catch (err) {
    showPageToast(err.message || "Could not duplicate the problem.", "warn");
    return;
  }
  location.assign(`/admin/problem-editor.html?type=${encodeURIComponent(copy.type)}&index=${nextIndex}`);
}

function nextProblemNo(pType) {
  const used = new Set();
  for (const p of state.keys) if (p.type === pType) used.add(p.index);
  for (const item of state.reserved) if (item.type === pType) used.add(item.index);
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