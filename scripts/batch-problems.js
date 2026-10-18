// Batch problem creation for one problem type.
// Loaded before script.js; uses the shared page state/functions at call time.

const batchView = document.querySelector("#problem-batch-view");
const batchRows = document.querySelector("#batch-rows");
const batchTitle = document.querySelector("#batch-title");
const batchError = document.querySelector("#batch-error");
const batchBack = document.querySelector("#batch-back");
const batchSave = document.querySelector("#batch-save");
const batchAddRow = document.querySelector("#batch-add-row");
const batchAddProblem = document.querySelector("#batch-add-problem");
let batchType = null;
let batchRowCounter = 0;

function batchProblemType() {
  return typeInfo(batchType) ? batchType : "math";
}

function readBatchRow(row) {
  return {
    index: row.querySelector("[data-batch-index]").value.trim(),
    prompt: row.querySelector("[data-batch-prompt]").value,
    answer: row.querySelector("[data-batch-answer]").value,
    logic: row.querySelector("[data-batch-logic]").value,
  };
}

function createBatchRow(index) {
  batchRowCounter += 1;
  const row = document.createElement("div");
  row.className = "batch-row";
  row.dataset.batchRow = String(batchRowCounter);

  const indexLabel = document.createElement("label");
  indexLabel.className = "batch-index-field";
  indexLabel.append("Index");
  const indexInput = document.createElement("input");
  indexInput.type = "number";
  indexInput.min = "1";
  indexInput.max = "999";
  indexInput.value = index === null || index === undefined ? "" : String(index);
  indexInput.dataset.batchIndex = "";
  indexLabel.append(indexInput);

  const statementLabel = document.createElement("label");
  statementLabel.className = "batch-wide";
  statementLabel.append("Statement");
  const statement = document.createElement("textarea");
  statement.rows = 4;
  statement.dataset.batchPrompt = "";
  statementLabel.append(statement);

  const answerLabel = document.createElement("label");
  answerLabel.className = "batch-wide";
  answerLabel.append("Answer");
  const answer = document.createElement("textarea");
  answer.rows = 2;
  answer.dataset.batchAnswer = "";
  answerLabel.append(answer);

  const logicLabel = document.createElement("label");
  logicLabel.className = "batch-wide";
  logicLabel.append("Logic (optional)");
  const logic = document.createElement("textarea");
  logic.rows = 3;
  logic.spellcheck = false;
  logic.dataset.batchLogic = "";
  logicLabel.append(logic);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "account-action danger";
  remove.dataset.batchRemove = "";
  remove.textContent = "Remove row";

  row.append(indexLabel, statementLabel, answerLabel, logicLabel, remove);
  batchRows.append(row);
  return row;
}

function nextBatchIndex() {
  const rows = [...batchRows.querySelectorAll(".batch-row")];
  const last = rows[rows.length - 1];
  if (last) {
    const value = Number(last.querySelector("[data-batch-index]").value);
    if (Number.isInteger(value) && value >= 1 && value < 999) return value + 1;
  }
  return nextProblemNo(batchProblemType()) ?? "";
}

function maybeAppendBatchRow() {
  const rows = [...batchRows.querySelectorAll(".batch-row")];
  const last = rows[rows.length - 1];
  if (!last) return;
  const values = readBatchRow(last);
  const index = Number(values.index);
  if (!Number.isInteger(index) || !values.prompt.trim() || !values.answer.trim()) return;
  const next = index + 1;
  if (next > 999) return;
  if (rows.some((row, position) => position !== rows.length - 1 && Number(row.querySelector("[data-batch-index]").value) === next)) return;
  createBatchRow(next);
}

function showBatchError(message) {
  batchError.hidden = false;
  batchError.textContent = message;
}

function showProblemBatch(type) {
  if (!batchView) return;
  batchType = typeInfo(type) ? type : "math";
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  batchView.hidden = false;
  setCurrentSection(problemsButton);
  batchTitle.textContent = `Batch add ${typeInfo(batchType).name} problems`;
  batchError.hidden = true;
  batchRows.replaceChildren();
  createBatchRow(nextProblemNo(batchType) ?? "");
  renderPlaceType();
}

function openProblemBatchForActiveType() {
  if (!activeProblemType) return;
  if (ROUTED) navigateTo(["problems", activeProblemType, "batch"]);
  else showProblemBatch(activeProblemType);
}

function closeProblemBatch() {
  const type = batchProblemType();
  if (ROUTED) navigateTo(["problems", type]);
  else showProblems();
}

function saveProblemBatch() {
  const type = batchProblemType();
  const rows = [...batchRows.querySelectorAll(".batch-row")];
  const entries = [];
  const seen = new Set();

  for (let position = 0; position < rows.length; position += 1) {
    const values = readBatchRow(rows[position]);
    const index = Number(values.index);
    const hasContent = Boolean(values.prompt.trim() || values.answer.trim() || values.logic.trim());
    if (!hasContent) continue;
    const label = `Row ${position + 1}`;
    if (!Number.isInteger(index) || index < 1 || index > 999) {
      showBatchError(`${label}: enter an index from 1 to 999.`);
      return;
    }
    if (!values.prompt.trim()) {
      showBatchError(`${label}: add a statement.`);
      return;
    }
    if (!values.answer.trim()) {
      showBatchError(`${label}: add an answer.`);
      return;
    }
    if (seen.has(index)) {
      showBatchError(`${label}: index ${index} is used twice in this batch.`);
      return;
    }
    if (findProblem(index, type)) {
      showBatchError(`${label}: ${problemTag(index, type)} already exists. Choose another index.`);
      return;
    }
    seen.add(index);
    entries.push({
      index,
      type,
      prompt: values.prompt,
      answer: values.answer,
      logic: values.logic,
      difficulty: "normal",
    });
  }

  if (entries.length === 0) {
    showBatchError("Add at least one problem with an index, statement, and answer.");
    return;
  }

  for (const entry of entries) problems.push(entry);
  problems.sort(compareProblems);
  persistProblems();
  activeProblemType = type;
  if (typeof showPageToast === "function") {
    showPageToast(`${entries.length} ${typeInfo(type).name} problem${entries.length === 1 ? "" : "s"} added.`, "ok");
  }
  closeProblemBatch();
}

batchAddProblem?.addEventListener("click", openProblemBatchForActiveType);
batchBack?.addEventListener("click", closeProblemBatch);
batchSave?.addEventListener("click", saveProblemBatch);
batchAddRow?.addEventListener("click", () => {
  createBatchRow(nextBatchIndex());
  const rows = batchRows.querySelectorAll(".batch-row");
  rows[rows.length - 1]?.querySelector("[data-batch-index]")?.focus();
});
batchRows?.addEventListener("input", (event) => {
  if (!event.target.closest(".batch-row")) return;
  batchError.hidden = true;
  maybeAppendBatchRow();
});
batchRows?.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-batch-remove]");
  if (!remove) return;
  const row = remove.closest(".batch-row");
  if (row) row.remove();
  if (!batchRows.querySelector(".batch-row")) createBatchRow(nextProblemNo(batchProblemType()) ?? "");
});
