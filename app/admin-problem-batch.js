import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=roles";
import { api } from "../shared/api.js?v=replace-batch";
import { el } from "../shared/dom.js";
import { MIN_PROBLEM_NO, MAX_PROBLEM_NO, YEAR_INDEX_START, YEAR_INDEX_END } from "../shared/constants.js";
import { typeInfo, difficultyScore, problemTag } from "../shared/difficulty.js";



const params = new URLSearchParams(location.search);
const type = typeInfo(params.get("type")) ? params.get("type") : "math";

const state = { problems: [], reserved: [], revisions: { problems: 0 }, rowCounter: 0 };

const rowsEl = document.querySelector("#batch-rows");
const titleEl = document.querySelector("#batch-title");
const errorEl = document.querySelector("#batch-error");
const backEl = document.querySelector("#batch-back");

async function run() {
  const data = await loadPage("page-problem-keys");
  state.problems = data.keys || [];
  state.reserved = data.reserved || [];
  state.revisions = data.revisions;
  titleEl.textContent = `Batch add ${typeInfo(type).name} problems`;
  backEl.href = `/admin/problems.html?type=${encodeURIComponent(type)}`;

  createRow(nextProblemNo(type) ?? "");
  bindEvents();
}

function bindEvents() {
  document.querySelector("#batch-advanced")?.addEventListener("click", () => {
    location.assign(`/admin/problem-batch2.html?type=${encodeURIComponent(type)}`);
  });
  document.querySelector("#batch-add-row")?.addEventListener("click", () => {
    createRow(nextRowIndex());
    rowsEl.querySelector(".batch-row:last-child [data-batch-index]")?.focus();
  });

  document.querySelector("#batch-save")?.addEventListener("click", saveAll);
  rowsEl?.addEventListener("input", (event) => {
    if (!event.target.closest(".batch-row")) return;
    errorEl.hidden = true;
    maybeAppend();
  });
  rowsEl?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-batch-remove]");
    if (!remove) return;
    const row = remove.closest(".batch-row");
    row?.remove();
    if (!rowsEl.querySelector(".batch-row")) createRow(nextProblemNo(type) ?? "");
  });
}

function createRow(index) {
  state.rowCounter += 1;
  const row = el("div", "batch-row");
  row.dataset.batchRow = String(state.rowCounter);

  const indexLabel = el("label", "batch-index-field");
  indexLabel.append("Index");
  const indexInput = document.createElement("input");
  indexInput.type = "number";
  indexInput.min = String(MIN_PROBLEM_NO);
  indexInput.max = String(MAX_PROBLEM_NO);
  indexInput.value = index === "" || index === null ? "" : String(index);
  indexInput.dataset.batchIndex = "";
  indexLabel.append(indexInput);

  const statementLabel = el("label", "batch-wide");
  statementLabel.append("Statement");
  const statement = document.createElement("textarea");
  statement.rows = 4;
  statement.dataset.batchPrompt = "";
  statementLabel.append(statement);

  const answerLabel = el("label", "batch-wide");
  answerLabel.append("Answer");
  const answer = document.createElement("textarea");
  answer.rows = 2;
  answer.dataset.batchAnswer = "";
  answerLabel.append(answer);

  const logicLabel = el("label", "batch-wide");
  logicLabel.append("Logic (optional)");
  const logic = document.createElement("textarea");
  logic.rows = 3;
  logic.spellcheck = false;
  logic.dataset.batchLogic = "";
  logicLabel.append(logic);

  const remove = el("button", "account-action danger", "Remove row");
  remove.type = "button";
  remove.dataset.batchRemove = "";

  row.append(indexLabel, statementLabel, answerLabel, logicLabel, remove);
  rowsEl.append(row);
}

function readRow(row) {
  return {
    index: row.querySelector("[data-batch-index]").value.trim(),
    prompt: row.querySelector("[data-batch-prompt]").value,
    answer: row.querySelector("[data-batch-answer]").value,
    logic: row.querySelector("[data-batch-logic]").value,
  };
}

function nextRowIndex() {
  const rows = [...rowsEl.querySelectorAll(".batch-row")];
  const last = rows[rows.length - 1];
  if (last) {
    const v = Number(last.querySelector("[data-batch-index]").value);
    if (Number.isInteger(v) && v >= 1 && v < MAX_PROBLEM_NO) return v + 1;
  }
  return nextProblemNo(type) ?? "";
}

function maybeAppend() {
  const rows = [...rowsEl.querySelectorAll(".batch-row")];
  const last = rows[rows.length - 1];
  if (!last) return;
  const v = readRow(last);
  const index = Number(v.index);
  if (!Number.isInteger(index) || !v.prompt.trim() || !v.answer.trim()) return;
  const next = index + 1;
  if (next > MAX_PROBLEM_NO) return;
  if (rows.some((r, i) => i !== rows.length - 1 && Number(r.querySelector("[data-batch-index]").value) === next)) return;
  createRow(next);
}

function nextProblemNo(pType) {
  const used = new Set();
  for (const p of state.problems) if (p.type === pType) used.add(p.index);
  for (const item of state.reserved) if (item.type === pType) used.add(item.index);
  for (let i = YEAR_INDEX_START; i <= YEAR_INDEX_END; i += 1) {
    if (!used.has(i)) return i;
  }
  return null;
}

function showError(msg) { errorEl.hidden = false; errorEl.textContent = msg; }

function confirmReplace(labels) {
  if (!labels.length) return false;
  const sample = labels.slice(0, 6).join(", ");
  const extra = labels.length > 6 ? ` and ${labels.length - 6} more` : "";
  const lead = labels.length === 1
    ? `${sample} already exists.`
    : `${labels.length} problems already exist: ${sample}${extra}.`;
  return window.confirm(`${lead} Replace ${labels.length === 1 ? "it" : "them"} with the new version${labels.length === 1 ? "" : "s"}?`);
}

function savedMessage(saved, replaced) {
  const added = saved - replaced;
  if (replaced && added) return `Added ${added} and replaced ${replaced}.`;
  if (replaced) return `Replaced ${replaced} problem${replaced === 1 ? "" : "s"}.`;
  return `Added ${added} problem${added === 1 ? "" : "s"}.`;
}

async function saveAll() {
  const rows = [...rowsEl.querySelectorAll(".batch-row")];
  const entries = [];
  const seen = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const v = readRow(rows[i]);
    const index = Number(v.index);
    const hasContent = Boolean(v.prompt.trim() || v.answer.trim() || v.logic.trim());
    if (!hasContent) continue;
    const label = `Row ${i + 1}`;
    if (!Number.isInteger(index) || index < MIN_PROBLEM_NO || index > MAX_PROBLEM_NO) {
      showError(`${label}: enter an index from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.`); return;
    }
    if (!v.prompt.trim()) { showError(`${label}: add a statement.`); return; }
    if (!v.answer.trim()) { showError(`${label}: add an answer.`); return; }
    if (seen.has(index)) { showError(`${label}: index ${index} used twice.`); return; }
    seen.add(index);
    entries.push({ index, type, prompt: v.prompt, answer: v.answer, logic: v.logic, difficulty: "normal", score: difficultyScore("normal") });
  }

  if (entries.length === 0) { showError("Add at least one problem."); return; }
  const existing = entries.filter((entry) => state.problems.some((p) => p.type === entry.type && p.index === entry.index));
  const replace = confirmReplace(existing.map((entry) => problemTag(entry.index, entry.type)));
  const saving = replace ? entries : entries.filter((entry) => !existing.includes(entry));
  if (!saving.length) {
    showPageToast("Nothing was added. The existing problems were left as they are.", "warn");
    return;
  }

  try {
    const data = await api.addProblems(saving, state.revisions.problems, replace && existing.length > 0);
    state.revisions.problems = data.revision;
    showPageToast(savedMessage(saving.length, replace ? existing.length : 0), "ok");
    location.assign(`/admin/problems.html?type=${encodeURIComponent(type)}`);
  } catch (err) {
    showError(err.message || "Could not save.");
  }
}
if (requireAdmin()) {
  initNav("problems");
  bindToastClose();
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message; }
  });
}