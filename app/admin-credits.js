import { requireSession, isAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { el, renderList } from "../shared/dom.js";
import { formatContestTime } from "../shared/contest-time.js";



const state = { versions: [] };

async function run() {
  try {
    const data = await loadPage("page-credits");
    state.versions = data.versions;
    render();
    const form = document.querySelector("#version-form");
    if (form) form.hidden = !isAdmin();
    form?.addEventListener("submit", addVersion);
    document.querySelector("#version-list")?.addEventListener("click", deleteVersion);
  } catch (err) {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message; }
  }
}

function render() {
  const list = document.querySelector("#version-list");
  const empty = document.querySelector("#version-empty");
  const notes = state.versions.filter(Boolean);
  empty.hidden = notes.length > 0;
  list.hidden = notes.length === 0;
  renderList(list, notes, (note) => {
    const item = el("li");
    const who = note.createdBy ? `Posted by ${note.createdBy}` : "Posted by unknown";
    const when = note.createdAt ? formatContestTime(note.createdAt) : "";
    item.append(
      el("p", "version-name", note.version),
      el("p", "version-message", note.message),
      el("p", "version-time", [who, when].filter(Boolean).join(" · "))
    );
    if (isAdmin() && note.id) {
      const remove = el("button", "account-action danger", "Delete");
      remove.type = "button";
      remove.dataset.deleteVersion = note.id;
      item.append(remove);
    }
    return item;
  });
}

async function deleteVersion(event) {
  const button = event.target.closest("[data-delete-version]");
  if (!button || !isAdmin()) return;
  const note = state.versions.find((item) => item.id === button.dataset.deleteVersion);
  const label = note?.version || "this version";
  if (!window.confirm(`Delete ${label}?`)) return;
  try {
    const data = await api.deleteVersion(button.dataset.deleteVersion);
    state.versions = Array.isArray(data.versions) ? data.versions : [];
    render();
    showPageToast("Version deleted.", "ok");
  } catch (err) {
    showPageToast(err.message || "Could not delete that version.", "warn");
  }
}

async function addVersion(event) {
  event.preventDefault();
  const name = document.querySelector("#version-name").value.trim();
  const message = document.querySelector("#version-message").value.trim();
  const formError = document.querySelector("#version-form-error");
  if (!name || !message) { formError.hidden = false; formError.textContent = "Add both a version and a message."; return; }
  formError.hidden = true;
  try {
    const data = await api.addVersion(name, message);
    state.versions = Array.isArray(data.versions) ? data.versions : state.versions;
    document.querySelector("#version-name").value = "";
    document.querySelector("#version-message").value = "";
    render();
    showPageToast("Version added.", "ok");
  } catch (err) {
    formError.hidden = false; formError.textContent = err.message;
  }
}
if (requireSession()) {
  initNav("credits");
  bindToastClose();
  run();
}