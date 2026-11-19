import { requireSession, isAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=roles";
import { api } from "../shared/api.js?v=roles";
import { el, renderList } from "../shared/dom.js";
import { formatContestTime } from "../shared/contest-time.js";

const state = { rules: [] };

async function run() {
  try {
    const data = await loadPage("page-rules");
    state.rules = Array.isArray(data.rules) ? data.rules : [];
    render();
    const form = document.querySelector("#rule-form");
    if (form) form.hidden = !isAdmin();
    form?.addEventListener("submit", addRule);
    document.querySelector("#rule-list")?.addEventListener("click", deleteRule);
  } catch (err) {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message; }
  }
}

function render() {
  const list = document.querySelector("#rule-list");
  const empty = document.querySelector("#rule-empty");
  const notes = state.rules.filter(Boolean);
  empty.hidden = notes.length > 0;
  list.hidden = notes.length === 0;
  renderList(list, notes, (note) => {
    const item = el("li");
    const who = note.createdBy ? `Posted by ${note.createdBy}` : "Posted by unknown";
    const when = note.createdAt ? formatContestTime(note.createdAt) : "";
    item.append(
      el("p", "version-name", note.title),
      el("p", "version-message", note.message),
      el("p", "version-time", [who, when].filter(Boolean).join(" · "))
    );
    if (isAdmin() && note.id) {
      const remove = el("button", "account-action danger", "Delete");
      remove.type = "button";
      remove.dataset.deleteRule = note.id;
      item.append(remove);
    }
    return item;
  });
}

async function deleteRule(event) {
  const button = event.target.closest("[data-delete-rule]");
  if (!button || !isAdmin()) return;
  const note = state.rules.find((item) => item.id === button.dataset.deleteRule);
  const label = note?.title || "this rule";
  if (!window.confirm(`Delete ${label}?`)) return;
  try {
    const data = await api.deleteRule(button.dataset.deleteRule);
    state.rules = Array.isArray(data.rules) ? data.rules : [];
    render();
    showPageToast("Rule deleted.", "ok");
  } catch (err) {
    showPageToast(err.message || "Could not delete that rule.", "warn");
  }
}

async function addRule(event) {
  event.preventDefault();
  const title = document.querySelector("#rule-title").value.trim();
  const message = document.querySelector("#rule-message").value.trim();
  const formError = document.querySelector("#rule-form-error");
  if (!title || !message) { formError.hidden = false; formError.textContent = "Add both a title and the rule text."; return; }
  formError.hidden = true;
  try {
    const data = await api.addRule(title, message);
    state.rules = Array.isArray(data.rules) ? data.rules : state.rules;
    document.querySelector("#rule-title").value = "";
    document.querySelector("#rule-message").value = "";
    render();
    showPageToast("Rule added.", "ok");
  } catch (err) {
    formError.hidden = false;
    formError.textContent = err.message;
  }
}

if (requireSession()) {
  initNav("rules");
  bindToastClose();
  run();
}
