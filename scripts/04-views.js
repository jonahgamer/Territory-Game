// ═══════════════════════════════════════════════════════════════════
// Views
// ═══════════════════════════════════════════════════════════════════

function showHome() {
  setMenuOpen(false);
  if (!requireSession()) return;
  if (isContestant()) {
    showStudent();
    return;
  }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  homeView.hidden = false;
  updateHomeLead();
  setCurrentSection(null);
}

function showMaps() {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  mapsView.hidden = false;
  setCurrentSection(mapsButton);
  renderMaps();
}

let accounts = [];

function showTutorial() {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  tutorialView.hidden = false;
  setCurrentSection(tutorialButton);
}

function showSettings() {
  if (!requireSession()) return;
  if (isContestant()) { showStudentSettings(); return; }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  settingsView.hidden = false;
  setCurrentSection(settingsButton);
  loadAccounts();
}

function answerOpenModeKey() {
  const username = session?.user?.username;
  return username ? `${ANSWER_OPEN_MODE_KEY}:${username}` : ANSWER_OPEN_MODE_KEY;
}

function readAnswerOpenMode() {
  try {
    return localStorage.getItem(answerOpenModeKey()) === "newtab" ? "newtab" : "current";
  } catch {
    return "current";
  }
}

function writeAnswerOpenMode(mode) {
  try {
    localStorage.setItem(answerOpenModeKey(), mode);
  } catch {
    // The setting still applies for this visit.
  }
}

function renderStudentSettings() {
  if (answerOpenModeChoices) {
    for (const button of answerOpenModeChoices.querySelectorAll("[data-answer-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.answerMode === answerOpenMode));
    }
  }
  if (answerOpenModeNote) {
    answerOpenModeNote.textContent = answerOpenMode === "newtab"
      ? "When you click a problem, it opens in a new tab. The board stays on this tab."
      : "When you click a problem, it opens over the board in this page. Only the Close button closes it.";
  }
}

function onAnswerModeClick(event) {
  const button = event.target.closest("[data-answer-mode]");
  if (!button) return;
  const next = button.dataset.answerMode;
  if (next !== "current" && next !== "newtab") return;
  answerOpenMode = next;
  writeAnswerOpenMode(next);
  renderStudentSettings();
}

function showStudentSettings() {
  if (!requireSession()) return;
  if (!studentSettingsView) {
    location.replace("/index.html#/settings");
    return;
  }
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  studentSettingsView.hidden = false;
  setCurrentSection(settingsButton);
  renderStudentSettings();
}
async function loadAccounts() {
  accountFormError.hidden = true;
  accountListError.hidden = true;
  try {
    const data = await apiCall("list-accounts");
    accounts = Array.isArray(data.accounts) ? data.accounts : [];
    renderAccounts();
  } catch (error) {
    accountListError.hidden = false;
    accountListError.textContent = error.message;
  }
}

async function createAccount(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const username = accountUsername.value.trim();
  const password = accountPassword.value;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
    accountFormError.hidden = false;
    accountFormError.textContent = "Username can use letters, numbers, dots, dashes, and underscores.";
    return;
  }
  if (password.length < 4) {
    accountFormError.hidden = false;
    accountFormError.textContent = "Password must be at least 4 characters.";
    return;
  }
  accountFormError.hidden = true;
  try {
    await apiCall("create-account", {
      username,
      displayName: accountDisplayName.value.trim(),
      password,
    });
    accountUsername.value = "";
    accountDisplayName.value = "";
    accountPassword.value = "";
    showAccountStatus(`Student ${username} created.`);
    await loadAccounts();
  } catch (error) {
    accountFormError.hidden = false;
    accountFormError.textContent = error.message;
  }
}

function showAccountStatus(message) {
  if (!accountStatus) return;
  clearTimeout(accountStatusTimer);
  accountStatus.hidden = !message;
  accountStatus.textContent = message || "";
  if (message) {
    accountStatusTimer = setTimeout(() => {
      accountStatus.hidden = true;
    }, 4500);
  }
}

function formatAccountDate(ms, empty = "Unknown") {
  if (!Number.isFinite(ms)) return empty;
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return empty;
  }
}

function accountFilterCounts() {
  return {
    all: accounts.length,
    admin: accounts.filter((account) => account.role === "admin").length,
    student: accounts.filter((account) => account.role === "student").length,
    suspended: accounts.filter((account) => account.banned).length,
  };
}

function accountMatchesFilters(account) {
  const query = accountQuery.toLowerCase();
  if (query) {
    const haystack = `${account.username} ${account.displayName} ${(account.teams || []).map((team) => `${team.teamName} ${team.contestName}`).join(" ")}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (accountFilter === "admin") return account.role === "admin";
  if (accountFilter === "student") return account.role === "student";
  if (accountFilter === "suspended") return account.banned === true;
  return true;
}

function renderAccountSummary() {
  if (!accountSummary) return;
  const counts = accountFilterCounts();
  const stats = [
    ["Accounts", counts.all],
    ["Students", counts.student],
    ["Admins", counts.admin],
    ["Suspended", counts.suspended],
  ];
  accountSummary.replaceChildren();
  for (const [label, value] of stats) {
    const stat = document.createElement("div");
    stat.className = "account-stat";
    const number = document.createElement("strong");
    number.textContent = String(value);
    const caption = document.createElement("span");
    caption.textContent = label;
    stat.append(number, caption);
    accountSummary.append(stat);
  }
}

function createAccountBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `account-badge ${className}`;
  badge.textContent = text;
  return badge;
}

function createAccountCard(account) {
  const item = document.createElement("li");
  item.className = account.banned ? "account-card suspended" : "account-card";
  item.dataset.username = account.username;

  const head = document.createElement("div");
  head.className = "account-card-head";
  const name = document.createElement("span");
  name.className = "account-card-name";
  name.textContent = account.username;
  head.append(name);
  head.append(createAccountBadge(account.role === "admin" ? "Admin" : "Student", account.role === "admin" ? "role-admin" : "role-student"));
  if (account.banned) head.append(createAccountBadge("Suspended", "status-banned"));

  const meta = document.createElement("p");
  meta.className = "account-card-meta";
  const displayName = account.displayName && account.displayName !== account.username
    ? `Display name: ${account.displayName}`
    : "No separate display name";
  meta.textContent = `${displayName} · Last login: ${formatAccountDate(account.lastLoginAt, "Never")} · Added: ${formatAccountDate(account.createdAt)}`;

  const teams = document.createElement("p");
  teams.className = "account-card-teams";
  const memberships = Array.isArray(account.teams) ? account.teams : [];
  if (memberships.length === 0) {
    teams.textContent = "Not on a contest team.";
  } else {
    teams.append("Teams: ");
    memberships.forEach((team, index) => {
      if (index > 0) teams.append(" · ");
      const chip = document.createElement("span");
      chip.className = "team-chip";
      chip.textContent = `${team.teamName} — ${team.contestName}`;
      teams.append(chip);
    });
  }

  item.append(head, meta, teams);

  if (account.role === "admin") {
    const note = document.createElement("p");
    note.className = "account-protected";
    note.textContent = "Administrator account — protected from edits, suspension, and deletion here.";
    item.append(note);
    return item;
  }

  const fields = document.createElement("div");
  fields.className = "account-fields";

  const displayField = document.createElement("label");
  displayField.className = "account-field";
  displayField.append("Display name");
  const displayInput = document.createElement("input");
  displayInput.type = "text";
  displayInput.maxLength = 60;
  displayInput.value = account.displayName;
  displayInput.dataset.accountDisplay = account.username;
  displayInput.setAttribute("aria-label", `Display name for ${account.username}`);
  displayField.append(displayInput);
  const displaySave = document.createElement("button");
  displaySave.type = "button";
  displaySave.className = "account-action";
  displaySave.dataset.accountSaveDisplay = account.username;
  displaySave.textContent = "Save name";

  const passwordField = document.createElement("label");
  passwordField.className = "account-field";
  passwordField.append("New password");
  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.maxLength = 256;
  passwordInput.placeholder = "At least 4 characters";
  passwordInput.autocomplete = "new-password";
  passwordInput.dataset.accountPasswordInput = account.username;
  passwordInput.setAttribute("aria-label", `New password for ${account.username}`);
  passwordField.append(passwordInput);
  const passwordSave = document.createElement("button");
  passwordSave.type = "button";
  passwordSave.className = "account-action";
  passwordSave.dataset.accountPassword = account.username;
  passwordSave.textContent = "Set password";

  fields.append(displayField, displaySave, passwordField, passwordSave);

  const actions = document.createElement("div");
  actions.className = "account-actions";
  const suspend = document.createElement("button");
  suspend.type = "button";
  suspend.className = "account-action";
  suspend.dataset.accountSuspend = account.username;
  suspend.dataset.banned = String(account.banned);
  suspend.textContent = account.banned ? "Restore account" : "Suspend account";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "account-action danger";
  remove.dataset.accountDelete = account.username;
  remove.textContent = "Delete account";
  remove.setAttribute("aria-label", `Delete ${account.username}`);
  actions.append(suspend, remove);

  item.append(fields, actions);
  return item;
}

function renderAccounts() {
  if (!accountList) return;
  const visible = accounts.filter(accountMatchesFilters);
  renderAccountSummary();
  if (accountFilters) {
    for (const button of accountFilters.querySelectorAll("[data-account-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.accountFilter === accountFilter));
    }
  }
  accountList.replaceChildren();
  accountEmpty.hidden = visible.length > 0;
  accountList.hidden = visible.length === 0;
  accountEmpty.textContent = accounts.length === 0
    ? "No accounts yet. Add the first student above."
    : "No accounts match this search and filter.";
  for (const account of visible) accountList.append(createAccountCard(account));
}

function onAccountFilterClick(event) {
  const button = event.target.closest("[data-account-filter]");
  if (!button) return;
  const next = button.dataset.accountFilter;
  if (!["all", "student", "admin", "suspended"].includes(next)) return;
  accountFilter = next;
  renderAccounts();
}

async function onAccountListClick(event) {
  const displayButton = event.target.closest("[data-account-save-display]");
  if (displayButton) {
    const card = displayButton.closest(".account-card");
    const field = card?.querySelector("[data-account-display]");
    await updateAccount(displayButton.dataset.accountSaveDisplay, { displayName: field?.value ?? "" }, "Display name saved.");
    return;
  }
  const passwordButton = event.target.closest("[data-account-password]");
  if (passwordButton) {
    const card = passwordButton.closest(".account-card");
    const field = card?.querySelector("[data-account-password-input]");
    if (!field || field.value.length < 4) {
      accountListError.hidden = false;
      accountListError.textContent = "Password must be at least 4 characters.";
      return;
    }
    await updateAccount(passwordButton.dataset.accountPassword, { password: field.value }, "Password changed.");
    return;
  }
  const suspendButton = event.target.closest("[data-account-suspend]");
  if (suspendButton) {
    const username = suspendButton.dataset.accountSuspend;
    const nextBanned = suspendButton.dataset.banned !== "true";
    if (nextBanned && !window.confirm(
      `Suspend ${username}?\n\nThey will be signed out on the next request, removed from any contest team, and cannot log in until restored.`
    )) return;
    await updateAccount(
      username,
      { banned: nextBanned },
      nextBanned ? `${username} is suspended.` : `${username} can sign in again.`
    );
    return;
  }
  const deleteButton = event.target.closest("[data-account-delete]");
  if (!deleteButton) return;
  const username = deleteButton.dataset.accountDelete;
  if (!confirmTwice(
    `Delete the student account ${username}?`,
    `Delete ${username} now? This removes them from contest teams and they will no longer be able to sign in.`
  )) return;
  accountListError.hidden = true;
  try {
    const data = await apiCall("delete-account", { username });
    noteRevision("contests", data);
    showAccountStatus(`${username} was deleted.`);
    await loadAccounts();
  } catch (error) {
    accountListError.hidden = false;
    accountListError.textContent = error.message;
  }
}

async function updateAccount(username, change, successMessage = "Account updated.") {
  if (typeof change.password === "string" && change.password.length < 4) {
    accountListError.hidden = false;
    accountListError.textContent = "Password must be at least 4 characters.";
    return;
  }
  accountListError.hidden = true;
  try {
    const data = await apiCall("update-account", { username, ...change });
    noteRevision("contests", data);
    showAccountStatus(successMessage);
    await loadAccounts();
  } catch (error) {
    accountListError.hidden = false;
    accountListError.textContent = error.message;
  }
}

function showProblems() {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  if (!discardUnsavedProblem() || !discardUnsavedMap()) return;
  stopPaint();
  openMapId = null;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  problemsView.hidden = false;
  setCurrentSection(problemsButton);
  renderProblems();
}

function showEditor(mapId, options = {}) {
  if (!requireSession()) return;
  if (isContestant()) { showCompetitions(); return; }
  if (mapSnapshot && mapSnapshot.id !== mapId && !discardUnsavedMap()) return;
  stopPaint();
  openMapId = mapId;
  openContestId = null;
  editingProblemNo = null;
  editingProblemType = null;
  hideViews();
  editorView.hidden = false;
  setCurrentSection(mapsButton);
  if (!options.keepTool) {
    chooseTool("problem");
    if (problemNoInput) problemNoInput.value = nextProblemLabel(placeType);
  }
  if (problemNoError) problemNoError.hidden = true;
  renderEditor();
  const map = currentMap();
  if (map && (!mapSnapshot || mapSnapshot.id !== map.id)) {
    mapSnapshot = structuredClone(map);
    mapDirty = false;
  }
  updateMapSaveButton();
}

function hideViews() {
  for (const view of [homeView, mapsView, problemsView, problemEditorView, problemBatchView, competitionsView, contestView, studentView, studentPlayView, studentSettingsView, editorView, settingsView, tutorialView, creditsView]) {
    if (view) view.hidden = true;
  }
}

function showPageToast(message, tone = "warn") {
  if (!pageToast || !pageToastMessage) return;
  clearTimeout(pageToastTimer);
  pageToast.dataset.tone = tone;
  pageToastMessage.textContent = message;
  pageToast.hidden = false;
  pageToastTimer = setTimeout(() => { pageToast.hidden = true; }, 6500);
}

function hidePageToast() {
  clearTimeout(pageToastTimer);
  if (pageToast) pageToast.hidden = true;
}
function setMenuOpen(open) {
  const wasOpen = document.body.classList.contains("menu-open");
  document.body.classList.toggle("menu-open", open);
  if (menuButton) {
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (wasOpen && !open) menuButton.focus();
  }
  if (sidebarBackdrop) sidebarBackdrop.hidden = !open;
}

function setCurrentSection(button) {
  for (const item of [mapsButton, problemsButton, competitionsButton, tutorialButton, creditsButton, settingsButton]) {
    item?.removeAttribute("aria-current");
  }
  if (button) button.setAttribute("aria-current", "page");
}


