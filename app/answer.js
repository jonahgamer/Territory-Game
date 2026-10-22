import { readStoredSession } from "../shared/session.js";
import { api } from "../shared/api.js";
import { noteServerTime } from "../shared/contest-time.js";
import { createStatementView } from "../shared/statement.js";
import { DIFFICULTY_NAME } from "../shared/constants.js";
import { problemScore } from "../shared/difficulty.js";

const params = new URLSearchParams(location.search);
const contestId = params.get("contest") || "";
const cellIndex = Number(params.get("cell"));

const status = document.querySelector("#answer-status");
const title = document.querySelector("#student-problem-tag");
const promptEl = document.querySelector("#student-problem-prompt");
const form = document.querySelector("#student-answer-form");
const answerInput = document.querySelector("#student-answer");
const errorEl = document.querySelector("#student-answer-error");

const statement = createStatementView(promptEl, {
  onAnswerValue: (v) => { answerInput.value = v; },
  onAnswerStyle: (css) => { answerInput.style.cssText = css; },
  onAnswerReadOnly: (ro) => { answerInput.readOnly = ro; },
  onAnswerError: (hidden, text) => {
    errorEl.hidden = hidden;
    errorEl.textContent = text;
  },
});

function showStatus(message) {
  status.hidden = false;
  status.textContent = message;
}

async function loadProblem() {
  if (!readStoredSession()) {
    location.replace("/login.html");
    return;
  }
  if (!contestId || !Number.isInteger(cellIndex) || cellIndex < 0) {
    showStatus("This problem link is not valid.");
    form.hidden = true;
    return;
  }
  try {
    const data = await api.bootstrap();
    noteServerTime(data.serverNow);
    const contest = (data.contests || []).find((c) => c.id === contestId);
    const map = contest && (data.maps || []).find((m) => m.id === contest.mapId);
    const mapCell = map?.cells?.[cellIndex];
    if (!contest || !map || mapCell?.kind !== "problem") {
      showStatus("That problem is not available.");
      form.hidden = true;
      return;
    }
    const problem = (data.problems || []).find((p) => p.index === mapCell.problemNo && p.type === mapCell.type);
    const difficulty = problem?.difficulty && DIFFICULTY_NAME[problem.difficulty] ? problem.difficulty : "normal";
    const points = problemScore(problem);
    title.textContent = `${DIFFICULTY_NAME[difficulty]} · ${points} point${points === 1 ? "" : "s"}`;
    const promptText = problem?.prompt?.trim() ? problem.prompt : "This problem has no text yet.";
    statement.render(promptText, title.textContent);
    if (answerInput.offsetParent !== null) answerInput.focus();
  } catch (err) {
    showStatus(err.message || "The problem could not be opened.");
    form.hidden = true;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const submit = form.querySelector("button");
  if (submit.disabled) return;
  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = "Checking...";

  const approval = await statement.approveSubmit();
  if (approval.blocked) {
    submit.disabled = false;
    submit.textContent = label;
    errorEl.hidden = false;
    errorEl.textContent = approval.message || "Finish the problem before submitting.";
    return;
  }

  try {
    await api.solve(contestId, cellIndex, answerInput.value);
    form.hidden = true;
    showStatus("Answer recorded. You can close this tab.");
  } catch (err) {
    errorEl.hidden = false;
    errorEl.textContent = err.message;
    submit.disabled = false;
    submit.textContent = label;
  }
});

loadProblem();