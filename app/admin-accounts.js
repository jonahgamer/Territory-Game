import { requireAdmin, isRoot } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { api } from "../shared/api.js";
import { el, renderList, formatAccountDate, confirmTwice } from "../shared/dom.js";

// ── 状态 ────────────────────────────────────────────────
const state = { accounts: [], filter: "all", query: "", statusTimer: null };

// ── 数据加载 ─────────────────────────────────────────────
async function load() {
  document.querySelector("#account-form-error").hidden = true;
  document.querySelector("#account-list-error").hidden = true;
  try {
    const data = await api.listAccounts();
    state.accounts = Array.isArray(data.accounts) ? data.accounts : [];
    render();
  } catch (err) {
    const e = document.querySelector("#account-list-error");
    e.hidden = false;
    e.textContent = err.message;
  }
}

// ── 工具 ─────────────────────────────────────────────────
function showStatus(msg) {
  const s = document.querySelector("#account-status");
  if (!s) return;
  clearTimeout(state.statusTimer);
  s.hidden = !msg;
  s.textContent = msg || "";
  if (msg) {
    state.statusTimer = setTimeout(() => { s.hidden = true; }, 4500);
  }
}

function matches(account) {
  const q = state.query.toLowerCase();
  if (q) {
    const hay = `${account.username} ${account.displayName} ${(account.teams || []).map((t) => `${t.teamName} ${t.contestName}`).join(" ")}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (state.filter === "admin") return account.role === "admin";
  if (state.filter === "root") return account.role === "root";
  if (state.filter === "student") return account.role === "student";
  if (state.filter === "suspended") return account.banned === true;
  return true;
}

// ── 渲染 ─────────────────────────────────────────────────
function render() {
  const summary = document.querySelector("#account-summary");
  if (summary) {
    const counts = {
      all: state.accounts.length,
      admin: state.accounts.filter((a) => a.role === "admin").length,
      root: state.accounts.filter((a) => a.role === "root").length,
      student: state.accounts.filter((a) => a.role === "student").length,
      suspended: state.accounts.filter((a) => a.banned).length,
    };
    summary.replaceChildren();
    const stats = [
      ["Accounts", counts.all],
      ["Students", counts.student],
      ["Admins", counts.admin],
      ["Root", counts.root],
      ["Suspended", counts.suspended],
    ];
    for (const [label, value] of stats) {
      const box = el("div", "account-stat");
      box.append(el("strong", null, String(value)), el("span", null, label));
      summary.append(box);
    }
  }

  for (const btn of document.querySelectorAll("[data-account-filter]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.accountFilter === state.filter));
  }

  const list = document.querySelector("#account-list");
  const empty = document.querySelector("#account-empty");
  if (!list || !empty) return;

  const visible = state.accounts.filter(matches);
  empty.hidden = visible.length > 0;
  list.hidden = visible.length === 0;
  empty.textContent = state.accounts.length === 0
    ? "No accounts yet. Add the first student above."
    : "No accounts match this search and filter.";
  renderList(list, visible, createCard);
}

function createCard(account) {
  const item = el("li", account.banned ? "account-card suspended" : "account-card");
  item.dataset.username = account.username;

  const head = el("div", "account-card-head");
  head.append(el("span", "account-card-name", account.username));
  const roleName = account.role === "root" ? "Root" : account.role === "admin" ? "Admin" : "Student";
  const roleClass = account.role === "root" ? "role-root" : account.role === "admin" ? "role-admin" : "role-student";
  head.append(el("span", `account-badge ${roleClass}`, roleName));
  if (account.banned) head.append(el("span", "account-badge status-banned", "Suspended"));

  const displayName = account.displayName && account.displayName !== account.username
    ? `Display name: ${account.displayName}`
    : "No separate display name";
  const meta = el(
    "p",
    "account-card-meta",
    `${displayName} · Last login: ${formatAccountDate(account.lastLoginAt, "Never")} · Added: ${formatAccountDate(account.createdAt)}`
  );

  const teams = el("p", "account-card-teams");
  const memberships = Array.isArray(account.teams) ? account.teams : [];
  if (memberships.length === 0) {
    teams.textContent = "Not on a contest team.";
  } else {
    teams.append("Teams: ");
    memberships.forEach((t, i) => {
      if (i > 0) teams.append(" · ");
      const chip = el("span", "team-chip", `${t.teamName} — ${t.contestName}`);
      teams.append(chip);
    });
  }

  item.append(head, meta, teams);

  if (account.role === "root") {
    item.append(el("p", "account-protected", "Root account. It cannot be changed or deleted."));
    return item;
  }
  if (account.role === "admin" && !isRoot()) {
    item.append(el("p", "account-protected", "Administrator account. Only root can change or delete it."));
    return item;
  }

  // 字段区
  const fields = el("div", "account-fields");

  const displayField = el("label", "account-field");
  displayField.append("Display name");
  const displayInput = document.createElement("input");
  displayInput.type = "text";
  displayInput.maxLength = 60;
  displayInput.value = account.displayName;
  displayInput.dataset.accountDisplay = account.username;
  displayInput.setAttribute("aria-label", `Display name for ${account.username}`);
  displayField.append(displayInput);

  const displaySave = el("button", "account-action", "Save name");
  displaySave.type = "button";
  displaySave.dataset.accountSaveDisplay = account.username;

  const pwField = el("label", "account-field");
  pwField.append("New password");
  const pwInput = document.createElement("input");
  pwInput.type = "password";
  pwInput.maxLength = 256;
  pwInput.placeholder = "At least 4 characters";
  pwInput.autocomplete = "new-password";
  pwInput.dataset.accountPasswordInput = account.username;
  pwInput.setAttribute("aria-label", `New password for ${account.username}`);
  pwField.append(pwInput);

  const pwSave = el("button", "account-action", "Set password");
  pwSave.type = "button";
  pwSave.dataset.accountPassword = account.username;

  fields.append(displayField, displaySave, pwField, pwSave);

  // 操作区
  const actions = el("div", "account-actions");
  const suspend = el("button", "account-action", account.banned ? "Restore account" : "Suspend account");
  suspend.type = "button";
  suspend.dataset.accountSuspend = account.username;
  suspend.dataset.banned = String(account.banned);

  const remove = el("button", "account-action danger", "Delete account");
  remove.type = "button";
  remove.dataset.accountDelete = account.username;
  remove.setAttribute("aria-label", `Delete ${account.username}`);

  actions.append(suspend, remove);
  item.append(fields, actions);
  return item;
}

// ── 事件 ─────────────────────────────────────────────────
async function onCreate(event) {
  event.preventDefault();
  const username = document.querySelector("#account-username").value.trim();
  const displayName = document.querySelector("#account-display-name").value.trim();
  const password = document.querySelector("#account-password").value;
  const role = isRoot() && document.querySelector("#account-role")?.value === "admin" ? "admin" : "student";
  const formError = document.querySelector("#account-form-error");

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
    formError.hidden = false;
    formError.textContent = "Username can use letters, numbers, dots, dashes, underscores, up to 64 characters.";
    return;
  }
  if (password.length < 4) {
    formError.hidden = false;
    formError.textContent = "Password must be at least 4 characters.";
    return;
  }
  formError.hidden = true;

  try {
    await api.createAccount({ username, displayName, password, role });
    document.querySelector("#account-username").value = "";
    document.querySelector("#account-display-name").value = "";
    document.querySelector("#account-password").value = "";
    const roleSelect = document.querySelector("#account-role");
    if (roleSelect) roleSelect.value = "student";
    showStatus(`${role === "admin" ? "Admin" : "Student"} ${username} created.`);
    await load();
  } catch (err) {
    formError.hidden = false;
    formError.textContent = err.message;
  }
}

function onFilter(event) {
  const btn = event.target.closest("[data-account-filter]");
  if (!btn) return;
  const f = btn.dataset.accountFilter;
  if (!["all", "student", "admin", "root", "suspended"].includes(f)) return;
  state.filter = f;
  render();
}

async function onListClick(event) {
  // 保存显示名
  const saveName = event.target.closest("[data-account-save-display]");
  if (saveName) {
    const card = saveName.closest(".account-card");
    const field = card?.querySelector("[data-account-display]");
    await updateAccount(saveName.dataset.accountSaveDisplay, { displayName: field?.value ?? "" }, "Display name saved.");
    return;
  }

  // 设置密码
  const pw = event.target.closest("[data-account-password]");
  if (pw) {
    const card = pw.closest(".account-card");
    const field = card?.querySelector("[data-account-password-input]");
    if (!field || field.value.length < 4) {
      const e = document.querySelector("#account-list-error");
      e.hidden = false;
      e.textContent = "Password must be at least 4 characters.";
      return;
    }
    await updateAccount(pw.dataset.accountPassword, { password: field.value }, "Password changed.");
    return;
  }

  // 暂停/恢复
  const suspend = event.target.closest("[data-account-suspend]");
  if (suspend) {
    const username = suspend.dataset.accountSuspend;
    const nextBanned = suspend.dataset.banned !== "true";
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

  // 删除
  const del = event.target.closest("[data-account-delete]");
  if (!del) return;
  const username = del.dataset.accountDelete;
  const target = state.accounts.find((account) => account.username === username);
  const kind = target?.role === "admin" ? "admin" : "student";
  if (!confirmTwice(
    `Delete the ${kind} account ${username}?`,
    `Delete ${username} now? This removes them from contest teams and they will no longer be able to sign in.`
  )) return;

  const e = document.querySelector("#account-list-error");
  e.hidden = true;
  try {
    await api.deleteAccount(username);
    showStatus(`${username} was deleted.`);
    await load();
  } catch (err) {
    e.hidden = false;
    e.textContent = err.message;
  }
}

async function updateAccount(username, change, success) {
  if (typeof change.password === "string" && change.password.length < 4) {
    const e = document.querySelector("#account-list-error");
    e.hidden = false;
    e.textContent = "Password must be at least 4 characters.";
    return;
  }
  const e = document.querySelector("#account-list-error");
  e.hidden = true;
  try {
    await api.updateAccount({ username, ...change });
    showStatus(success);
    await load();
  } catch (err) {
    e.hidden = false;
    e.textContent = err.message;
  }
}

// ── 启动 ─────────────────────────────────────────────────
async function run() {
  const roleField = document.querySelector("#account-role-field");
  if (roleField) roleField.hidden = !isRoot();
  await load();
  document.querySelector("#account-form")?.addEventListener("submit", onCreate);
  document.querySelector("#account-list")?.addEventListener("click", onListClick);
  document.querySelector("#account-filters")?.addEventListener("click", onFilter);
  document.querySelector("#account-search")?.addEventListener("input", () => {
    state.query = document.querySelector("#account-search").value.trim();
    render();
  });

  // bfcache 恢复时重新拉取（后退按钮场景）
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    try { await load(); } catch {}
  });
}

if (requireAdmin()) {
  initNav("accounts");
  bindToastClose();
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message || "Could not load accounts."; }
  });
}