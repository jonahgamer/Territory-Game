// ═══════════════════════════════════════════════════════════════════
// HTML preview for problem fields
// ═══════════════════════════════════════════════════════════════════

function renderProblemPreview() {
  if (!problemEditorForm) return;

  let previewEl = problemEditorForm.querySelector(":scope > .problem-preview");
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.className = "problem-preview";
    problemEditorForm.appendChild(previewEl);
  }
  previewEl.replaceChildren();

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


