const shown = new Set();
const waiting = [];
let open = false;

function linesOf(messages) {
  const source = Array.isArray(messages) ? messages : [messages];
  const lines = [];
  for (const item of source) {
    const text = String(item || "").trim();
    if (text) lines.push(text);
  }
  return lines;
}

export function showRulePopup(messages) {
  const lines = linesOf(messages);
  if (!lines.length) return;
  waiting.push(lines);
  revealNext();
}

export function showRulePopupOnce(messages) {
  const lines = linesOf(messages);
  const key = lines.join("\n");
  if (!key || shown.has(key)) return;
  shown.add(key);
  showRulePopup(lines);
}

function revealNext() {
  if (open || !waiting.length) return;
  const lines = waiting.shift();
  open = true;
  const modal = document.createElement("div");
  modal.className = "rule-popup";
  const dialog = document.createElement("div");
  dialog.className = "rule-popup-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "rule-popup-title");
  const title = document.createElement("h2");
  title.id = "rule-popup-title";
  title.textContent = lines.some((line) => /hidden rule/i.test(line)) ? "Hidden rule" : "Contest rule";
  dialog.append(title);
  for (const line of lines) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    dialog.append(paragraph);
  }
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "OK";
  const close = () => {
    modal.remove();
    open = false;
    revealNext();
  };
  closeButton.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  dialog.append(closeButton);
  modal.append(dialog);
  document.body.append(modal);
  closeButton.focus();
}
