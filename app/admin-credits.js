import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { api } from "../shared/api.js";
import { el, renderList } from "../shared/dom.js";
import { formatContestTime } from "../shared/contest-time.js";

if (requireAdmin()) {
  initNav("credits");
  bindToastClose();
  run();
}

const state = { versions: [] };

async function run() {
  try {
    const data = await loadBootstrap();
    state.versions = data.versions;
    render();
    document.querySelector("#version-form")?.addEventListener("submit", addVersion);
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
    item.append(
      el("p", "version-name", note.version),
      el("p", "version-message", note.message),
      el("p", "version-time", note.createdAt ? formatContestTime(note.createdAt) : "")
    );
    return item;
  });
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