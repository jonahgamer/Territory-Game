import { requireContestant, getSession } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose } from "../shared/toast.js";
import { ANSWER_OPEN_MODE_KEY } from "../shared/constants.js";

if (requireContestant()) {
  initNav("settings");
  bindToastClose();
  run();
}

function keyFor() {
  const username = getSession()?.user?.username;
  return username ? `${ANSWER_OPEN_MODE_KEY}:${username}` : ANSWER_OPEN_MODE_KEY;
}

function readMode() {
  try { return localStorage.getItem(keyFor()) === "newtab" ? "newtab" : "current"; }
  catch { return "current"; }
}

function writeMode(mode) {
  try { localStorage.setItem(keyFor(), mode); } catch {}
}

function render() {
  const mode = readMode();
  for (const btn of document.querySelectorAll("[data-answer-mode]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.answerMode === mode));
  }
  const note = document.querySelector("#answer-open-mode-note");
  if (note) {
    note.textContent = mode === "newtab"
      ? "When you click a problem, it opens in a new tab. The board stays on this tab."
      : "When you click a problem, it opens over the board in this page. Only the Close button closes it.";
  }
}

function run() {
  document.querySelector("#answer-open-mode")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-answer-mode]");
    if (!btn) return;
    const next = btn.dataset.answerMode;
    if (next !== "current" && next !== "newtab") return;
    writeMode(next);
    render();
  });
  render();
}