// ═══════════════════════════════════════════════════════════════════
// HTML preview and admin test submission for problem fields
// ═══════════════════════════════════════════════════════════════════

let problemTestKey = "";

function clearProblemTestResult() {
  const result = document.querySelector("#problem-test-result");
  if (!result) return;
  result.hidden = true;
  result.replaceChildren();
  delete result.dataset.result;
}

function resetProblemTest() {
  const input = document.querySelector("#problem-test-answer");
  if (input) input.value = "";
  clearProblemTestResult();
}

function ensureProblemTestBox(previewEl) {
  if (!problemEditorForm || !previewEl) return null;
  let box = problemEditorForm.querySelector("#problem-test-box");
  if (!box) {
    box = document.createElement("section");
    box.id = "problem-test-box";
    box.className = "problem-test-box";

    const title = document.createElement("h3");
    title.textContent = "Test submission";

    const note = document.createElement("p");
    note.className = "field-note";
    note.textContent = "Run the current Answer and Logic fields without saving. The test runs in the server sandbox.";

    const label = document.createElement("label");
    label.className = "problem-test-answer-field";
    label.append("Student answer");
    const input = document.createElement("textarea");
    input.id = "problem-test-answer";
    input.rows = 2;
    input.placeholder = "Type the answer a student would submit";
    label.append(input);

    const actions = document.createElement("div");
    actions.className = "problem-test-actions";
    const run = document.createElement("button");
    run.id = "problem-test-run";
    run.type = "button";
    run.textContent = "Run test";
    actions.append(run);

    const result = document.createElement("div");
    result.id = "problem-test-result";
    result.className = "problem-test-result";
    result.hidden = true;

    box.append(title, note, label, actions, result);
    previewEl.after(box);
    run.addEventListener("click", runProblemTest);
    input.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runProblemTest();
      }
    });
    input.addEventListener("input", clearProblemTestResult);
    problemAnswer?.addEventListener("input", clearProblemTestResult);
    problemLogic?.addEventListener("input", clearProblemTestResult);
  }
  return box;
}

function renderProblemTestResult(state, title, detail) {
  const result = document.querySelector("#problem-test-result");
  if (!result) return;
  result.hidden = false;
  result.dataset.result = state;
  result.replaceChildren();
  const badge = document.createElement("strong");
  badge.className = "problem-test-badge";
  badge.textContent = title;
  result.append(badge);
  if (detail) {
    const text = document.createElement("p");
    text.className = "problem-test-detail";
    text.textContent = detail;
    result.append(text);
  }
}

async function runProblemTest() {
  const button = document.querySelector("#problem-test-run");
  const input = document.querySelector("#problem-test-answer");
  if (!button || !input || !problemLogic || !problemAnswer) return;
  button.disabled = true;
  renderProblemTestResult("RUNNING", "Testing...", "Running the checker in the server sandbox.");

  try {
    const data = await apiCall("test-problem", {
      logic: problemLogic.value,
      expected: problemAnswer.value,
      answer: input.value,
    });
    if (data.systemError) {
      renderProblemTestResult(
        "ERROR",
        "Runtime error",
        data.error || data.comment || "The checker could not run."
      );
      return;
    }

    const details = [];
    const comment = typeof data.comment === "string" ? data.comment.trim() : "";
    if (comment && comment !== "AC" && comment !== "WA") details.push(comment);
    if (typeof data.score === "number") details.push(`Score: ${data.score}/100`);

    if (data.correct) {
      renderProblemTestResult("AC", "AC", details.join(" · "));
    } else {
      renderProblemTestResult("WA", "WA", details.join(" · "));
    }
  } catch (error) {
    renderProblemTestResult("ERROR", "Error", error.message);
  } finally {
    button.disabled = false;
  }
}

function renderProblemPreview() {
  if (!problemEditorForm) return;

  let previewEl = problemEditorForm.querySelector(":scope > .problem-preview");
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.className = "problem-preview";
    problemEditorForm.appendChild(previewEl);
  }
  previewEl.replaceChildren();

  const key = `${editingProblemType || ""}:${editingProblemNo ?? ""}`;
  if (problemTestKey !== key) {
    problemTestKey = key;
    resetProblemTest();
  }
  ensureProblemTestBox(previewEl);

  const promptHtml = (problemPrompt.value || "").trim();
  const answerHtml = (problemAnswer.value || "").trim();

  if (!promptHtml && !answerHtml) {
    previewEl.hidden = true;
    return;
  }
  previewEl.hidden = false;

  const box = document.createElement("div");
  box.className = "problem-preview-box";
  previewEl.appendChild(box);

  if (promptHtml) {
    const title = document.createElement("div");
    title.className = "problem-preview-title";
    title.textContent = "Prompt — preview";
    const content = document.createElement("div");
    content.className = "problem-preview-content";
    box.append(title, content);
    setRichText(content, promptHtml);
  }

  if (answerHtml) {
    const title = document.createElement("div");
    title.className = "problem-preview-title";
    title.textContent = "Answer — preview";
    const content = document.createElement("div");
    content.className = "problem-preview-content";
    box.append(title, content);
    setRichText(content, answerHtml);
  }
}
