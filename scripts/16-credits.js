// ═══════════════════════════════════════════════════════════════════
// Credits / versions
// ═══════════════════════════════════════════════════════════════════

function loadedVersion(raw) {
  const version = String(raw?.version || "").trim().slice(0, 40);
  const message = String(raw?.message || "").slice(0, 4000);
  if (!version || !message) return null;
  return {
    id: String(raw.id || ""),
    version,
    message,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
  };
}

function showCredits() {
  if (!requireSession() || !creditsView) return;
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  creditsView.hidden = false;
  setCurrentSection(creditsButton);
  if (versionForm) versionForm.hidden = !isAdmin();
  renderVersions();
}

function renderVersions() {
  if (!versionList || !versionEmpty) return;
  versionList.replaceChildren();
  const notes = versions.filter(Boolean);
  versionEmpty.hidden = notes.length > 0;
  versionList.hidden = notes.length === 0;
  for (const note of notes) {
    const item = document.createElement("li");
    const name = document.createElement("p");
    const message = document.createElement("p");
    const time = document.createElement("p");
    name.className = "version-name";
    name.textContent = note.version;
    message.className = "version-message";
    message.textContent = note.message;
    time.className = "version-time";
    time.textContent = note.createdAt ? formatContestTime(note.createdAt) : "";
    item.append(name, message, time);
    versionList.append(item);
  }
}

async function addVersion(event) {
  event.preventDefault();
  if (!isAdmin() || !versionNameInput || !versionMessageInput) return;
  const version = versionNameInput.value.trim();
  const message = versionMessageInput.value.trim();
  if (!version || !message) {
    versionFormError.hidden = false;
    versionFormError.textContent = "Add both a version and a message.";
    return;
  }
  versionFormError.hidden = true;
  try {
    const data = await apiCall("add-version", { version, message });
    versions = Array.isArray(data.versions) ? data.versions.map(loadedVersion).filter(Boolean) : versions;
    versionNameInput.value = "";
    versionMessageInput.value = "";
    renderVersions();
  } catch (error) {
    versionFormError.hidden = false;
    versionFormError.textContent = error.message;
  }
}
