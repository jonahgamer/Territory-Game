import { requireSession, getSession, setSession, isContestant } from "../shared/session.js?v=account";
import { initNav } from "../shared/nav.js?v=account";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { api } from "../shared/api.js?v=account";
import { ANSWER_OPEN_MODE_KEY } from "../shared/constants.js";

if (requireSession()) {
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

function renderAnswerMode() {
  const section = document.querySelector("#student-settings-view");
  if (section) section.hidden = !isContestant();
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

function fillAccount() {
  const user = getSession()?.user;
  if (!user) return;
  document.querySelector("#settings-display-name").value = user.displayName || user.username;
  document.querySelector("#settings-username").value = user.username;
  document.querySelector("#settings-pfp").value = user.pfp || "";
}

function run() {
  fillAccount();
  renderAnswerMode();
  document.querySelector("#answer-open-mode")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-answer-mode]");
    if (!btn || !isContestant()) return;
    const next = btn.dataset.answerMode;
    if (next !== "current" && next !== "newtab") return;
    writeMode(next);
    renderAnswerMode();
  });
  document.querySelector("#account-settings-form")?.addEventListener("submit", saveAccount);
}

async function saveAccount(event) {
  event.preventDefault();
  const error = document.querySelector("#account-settings-error");
  const displayName = document.querySelector("#settings-display-name").value.trim();
  const username = document.querySelector("#settings-username").value.trim();
  const pfp = document.querySelector("#settings-pfp").value.trim();
  const currentPassword = document.querySelector("#settings-current-password").value;
  const password = document.querySelector("#settings-new-password").value;
  const confirm = document.querySelector("#settings-confirm-password").value;
  const user = getSession()?.user;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
    error.hidden = false;
    error.textContent = "Username can use letters, numbers, dots, dashes, and underscores, up to 64 characters.";
    return;
  }
  if (password && password.length < 4) {
    error.hidden = false;
    error.textContent = "A new password must be at least 4 characters.";
    return;
  }
  if (password !== confirm) {
    error.hidden = false;
    error.textContent = "The new password and the repeated password do not match.";
    return;
  }
  const renaming = username !== user?.username;
  if ((renaming || password) && !currentPassword) {
    error.hidden = false;
    error.textContent = "Enter the current password to change the username or password.";
    return;
  }
  error.hidden = true;
  try {
    const data = await api.updateSelf({
      displayName,
      username,
      pfp,
      ...(currentPassword ? { currentPassword } : {}),
      ...(password ? { password } : {}),
    });
    setSession({ token: data.token, user: data.user });
    document.querySelector("#settings-current-password").value = "";
    document.querySelector("#settings-new-password").value = "";
    document.querySelector("#settings-confirm-password").value = "";
    fillAccount();
    initNav("settings");
    showPageToast("Account saved.", "ok");
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message || "Could not save the account.";
  }
}
