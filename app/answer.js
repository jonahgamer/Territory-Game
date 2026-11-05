import { readStoredSession } from "../shared/session.js";
import { api } from "../shared/api.js?v=parts";
import { loadPage } from "../shared/data.js?v=page-data";
import { noteServerTime } from "../shared/contest-time.js";
import { createStatementView } from "../shared/statement.js";
import { DIFFICULTY_NAME } from "../shared/constants.js";
import { problemScore } from "../shared/difficulty.js";
import { teamForUser, teamEnergy } from "../shared/contest-data.js";
import { readEnergySettings } from "../shared/energy.js";
import { publishContestPatch } from "../shared/contest-sync.js";

const params = new URLSearchParams(location.search);
const contestId = params.get("contest") || "";
const cellIndex = Number(params.get("cell"));
const requestedMapId = params.get("map") || "";
let openMapId = requestedMapId;

const status = document.querySelector("#answer-status");
const title = document.querySelector("#student-problem-tag");
const promptEl = document.querySelector("#student-problem-prompt");
const form = document.querySelector("#student-answer-form");
const answerInput = document.querySelector("#student-answer");
const errorEl = document.querySelector("#student-answer-error");

let contest = null;
let problemParts = [];

function renderParts(parts) {
  problemParts = Array.isArray(parts) ? parts : [];
  const host = document.querySelector("#answer-parts");
  const single = document.querySelector("#single-answer-field");
  if (!host || !single) return;
  host.replaceChildren();
  const multi = problemParts.length > 0;
  host.hidden = !multi;
  single.hidden = multi;
  problemParts.forEach((part, index) => {
    const block = document.createElement("div");
    block.className = "problem-part";
    const line = document.createElement("div");
    line.className = "problem-part-line";
    const mark = document.createElement("span");
    mark.className = "problem-part-mark";
    mark.textContent = `(${String.fromCharCode(97 + index)})`;
    const body = document.createElement("div");
    body.className = "problem-part-body";
    if (part?.prompt?.trim()) {
      const desc = document.createElement("div");
      desc.className = "problem-part-prompt";
      body.append(desc);
      createStatementView(desc, {}).render(part.prompt);
    }
    const label = document.createElement("label");
    label.append("Answer");
    const input = document.createElement("textarea");
    input.dataset.partAnswer = String(index);
    input.rows = 3;
    input.maxLength = 5000;
    label.append(input);
    body.append(label);
    line.append(mark, body);
    block.append(line);
    host.append(block);
  });
}

function submittedAnswers() {
  if (!problemParts.length) return { answer: answerInput.value, answers: null };
  const answers = [...form.querySelectorAll("[data-part-answer]")].map((input) => input.value);
  return { answer: answers.join("\n"), answers };
}

function paintEnergy() {
  const node = document.querySelector("#answer-energy");
  const track = document.querySelector("#answer-energy-track");
  const fill = document.querySelector("#answer-energy-fill");
  const team = contest && teamForUser(contest);
  if (!node || !track || !fill || !team) return;
  const settings = readEnergySettings(contest);
  const value = teamEnergy(contest, team.id);
  const blocked = value < settings.attemptMin;
  node.hidden = false;
  track.hidden = false;
  node.textContent = blocked
    ? `Energy ${value} / 100. An attempt needs at least ${settings.attemptMin}.`
    : `Energy ${value} / 100. Restores ${settings.regen} every ${settings.regenSeconds}s. Each attempt spends ${settings.attemptCost}.`;
  fill.style.width = `${value}%`;
  fill.classList.toggle("low", blocked);
  const submit = form.querySelector("button");
  if (submit && submit.dataset.busy !== "1") submit.disabled = blocked;
}

function takeServerContest(next, serverNow) {
  if (!contest || !next) return;
  if (Array.isArray(next.energy)) contest.energy = next.energy;
  noteServerTime(serverNow);
  paintEnergy();
  publishContestPatch(contestId, next, serverNow);
}

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
    const data = await loadPage("page-answer", { contest: contestId, map: requestedMapId, cell: cellIndex });
    contest = data.contest;
    openMapId = data.mapId || requestedMapId || contest?.mapId || "";
    const problem = data.problem;
    const difficulty = problem?.difficulty && DIFFICULTY_NAME[problem.difficulty] ? problem.difficulty : "normal";
    const points = problemScore(problem);
    title.textContent = `${DIFFICULTY_NAME[difficulty]} · ${points} point${points === 1 ? "" : "s"}`;
    const parts = Array.isArray(problem?.parts) ? problem.parts : [];
    renderParts(parts);
    const promptText = problem?.prompt?.trim()
      ? problem.prompt
      : (parts.length ? "" : "This problem has no text yet.");
    statement.render(promptText, title.textContent);
    paintEnergy();
    setInterval(paintEnergy, 1000);
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
  submit.dataset.busy = "1";
  submit.disabled = true;
  submit.textContent = "Checking...";

  const approval = await statement.approveSubmit();
  if (approval.blocked) {
    submit.dataset.busy = "";
    submit.disabled = false;
    submit.textContent = label;
    errorEl.hidden = false;
    errorEl.textContent = approval.message || "Finish the problem before submitting.";
    return;
  }

  const submitted = submittedAnswers();
  if (submitted.answers && submitted.answers.some((value) => !value.trim())) {
    submit.dataset.busy = "";
    submit.disabled = false;
    submit.textContent = label;
    errorEl.hidden = false;
    errorEl.textContent = "Answer every part.";
    paintEnergy();
    return;
  }

  try {
    const data = await api.solve(contestId, cellIndex, submitted.answer, openMapId, submitted.answers);
    takeServerContest(data.contest, data.serverNow);
    submit.dataset.busy = "";
    form.hidden = true;
    showStatus("Answer recorded. You can close this tab.");
  } catch (err) {
    takeServerContest(err.data?.contest, err.data?.serverNow);
    errorEl.hidden = false;
    errorEl.textContent = err.message;
    submit.dataset.busy = "";
    submit.disabled = false;
    submit.textContent = label;
    paintEnergy();
  }
});

loadProblem();