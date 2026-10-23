import { requireAdmin } from "../shared/session.js";
import { getSession, logOut } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { el } from "../shared/dom.js";

const API = "/api/backup";

const state = {
  data: null,
  selected: null,
  busy: false,
};

function secretReady(data = state.data) {
  return Boolean(data?.secretConfigured ?? data?.restoreConfigured);
}

async function request(action, body) {
  const session = getSession();
  if (!session?.token) {
    location.replace("/login.html");
    return new Promise(() => {});
  }

  const isGet = body === undefined;
  const headers = { Authorization: `Bearer ${session.token}` };
  if (!isGet) headers["Content-Type"] = "application/json";

  const res = await fetch(isGet ? `${API}?action=${encodeURIComponent(action)}` : API, {
    method: isGet ? "GET" : "POST",
    headers,
    body: isGet ? undefined : JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    logOut();
    return new Promise(() => {});
  }
  if (!res.ok || data.success === false) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function run() {
  document.querySelector("#backup-refresh")?.addEventListener("click", () => load());
  document.querySelector("#backup-now")?.addEventListener("click", backUpNow);
  document.querySelector("#backup-secret")?.addEventListener("input", syncButtons);
  document.querySelector("#restore-cancel")?.addEventListener("click", closeRestore);
  document.querySelector("#restore-confirm")?.addEventListener("input", syncButtons);
  document.querySelector("#restore-understand")?.addEventListener("change", syncButtons);
  document.querySelector("#restore-button")?.addEventListener("click", restoreSelected);
  window.addEventListener("beforeunload", (event) => {
    if (!state.busy) return;
    event.preventDefault();
    event.returnValue = "";
  });

  await load();
}

async function load() {
  if (state.busy) return;
  setStatus("Loading…");
  try {
    const data = await request("tree");
    state.data = data;
    state.selected = null;
    render();
    setStatus("");
  } catch (err) {
    showLoadError(err.message || "Could not load the backup tree.");
    setStatus("");
  }
}

function showLoadError(message) {
  const node = document.querySelector("#load-error");
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
}

function setStatus(text) {
  const node = document.querySelector("#backup-status");
  if (node) node.textContent = text || "";
}

function syncButtons() {
  const data = state.data;
  const secret = document.querySelector("#backup-secret")?.value || "";
  const backupNow = document.querySelector("#backup-now");
  const refresh = document.querySelector("#backup-refresh");
  if (backupNow) {
    backupNow.disabled = state.busy || !data?.configured || !secretReady(data) || !secret
      || Boolean(data?.lock?.active);
  }
  if (refresh) refresh.disabled = state.busy;
  const restore = document.querySelector("#restore-button");
  if (restore) {
    const code = document.querySelector("#restore-confirm")?.value || "";
    const understood = Boolean(document.querySelector("#restore-understand")?.checked);
    restore.disabled = state.busy || !state.selected || !code || !understood
      || Boolean(data?.lock?.active);
  }
  const cancel = document.querySelector("#restore-cancel");
  if (cancel) cancel.disabled = state.busy;
  const confirm = document.querySelector("#restore-confirm");
  if (confirm) confirm.disabled = state.busy;
  const understood = document.querySelector("#restore-understand");
  if (understood) understood.disabled = state.busy;
  const unlock = document.querySelector("#backup-unlock");
  if (unlock) unlock.disabled = state.busy || !secretReady(data) || !secret;
}

function render() {
  const data = state.data;
  if (!data) return;
  showLoadError("");
  const loadError = document.querySelector("#load-error");
  if (loadError && !loadError.textContent) loadError.hidden = true;

  renderConfig(data);
  renderLock(data);
  renderCurrent(data);
  renderTree(data);
  renderRestorePanel();
  syncButtons();
}

function renderConfig(data) {
  const box = document.querySelector("#backup-config");
  if (!box) return;
  box.replaceChildren();
  box.className = "backup-config";
  const messages = [];

  if (!data.configured) {
    messages.push(data.config?.error || "GitHub backup is not configured. Set the GITHUB_BACKUP_* environment variables.");
  }
  if (data.backupError) {
    messages.push(`The backup repository could not be read: ${data.backupError}`);
  }
  if (!secretReady(data)) {
    messages.push("Manual backup, unlock, and restore are disabled because the server environment variable DSCONFIRM is not set.");
  }

  if (messages.length === 0) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (!data.configured || data.backupError) box.classList.add("error");
  else box.classList.add("warn");
  for (const message of messages) box.append(el("p", "", message));
}

function renderLock(data) {
  const box = document.querySelector("#backup-lock");
  if (!box) return;
  box.replaceChildren();
  box.hidden = true;
  const lock = data.lock;
  if (!lock || (!lock.exists && !lock.active)) return;

  box.hidden = false;
  const line = el("p");
  if (lock.active) {
    line.append(document.createTextNode("Backup operation in progress: "));
    line.append(el("strong", "", lock.action || "unknown"));
    line.append(document.createTextNode(
      ` by ${lock.owner || "unknown"}. Started ${formatMoment(lock.startedAt)}; expires ${formatMoment(lock.expiresAt)}.`
    ));
  } else {
    line.textContent = `A stale backup lock is present (${lock.action || "unknown"} by ${lock.owner || "unknown"}). You can release it below.`;
  }
  box.append(line);
  if (lock.error) box.append(el("p", "", lock.error));

  const unlock = el("button", "", "Release lock");
  unlock.type = "button";
  unlock.id = "backup-unlock";
  unlock.addEventListener("click", unlockBackupLock);
  box.append(unlock);
}

async function unlockBackupLock() {
  if (state.busy || !secretReady()) return;
  const secret = document.querySelector("#backup-secret")?.value || "";
  if (!secret) {
    showPageToast("Enter the DSCONFIRM secret first.", "warn");
    return;
  }
  state.busy = true;
  syncButtons();
  setStatus("Releasing backup lock…");
  showLog([`[${new Date().toLocaleTimeString()}] Releasing the backup lock.`]);
  try {
    const data = await request("unlock", { confirm: secret });
    state.data = data.tree || state.data;
    const secretInput = document.querySelector("#backup-secret");
    if (secretInput) secretInput.value = "";
    render();
    showPageToast("Backup lock released.", "ok");
    showLog([`[${new Date().toLocaleTimeString()}] Backup lock released.`]);
  } catch (err) {
    showPageToast(err.message || "Could not release the backup lock.", "warn");
    showLog([`[${new Date().toLocaleTimeString()}] Unlock failed.`, err.message]);
  } finally {
    state.busy = false;
    syncButtons();
    setStatus("");
  }
}

function renderCurrent(data) {
  const host = document.querySelector("#backup-current");
  if (!host) return;
  host.replaceChildren();

  const current = data.current || {};
  const collections = current.collections || {};
  const head = (data.backups || []).find((backup) => backup.id === data.state?.head);
  const card = el("article", "backup-live-card");

  const top = el("div", "backup-node-head");
  top.append(el("span", "backup-badge live", "LIVE"));
  top.append(el("h2", "", "Current database"));
  card.append(top);

  const copy = el("p", "backup-live-copy");
  if (head) {
    copy.append(document.createTextNode("Head backup: "));
    const time = el("strong", "", formatDate(head.createdAt));
    copy.append(time);
    copy.append(document.createTextNode(" · branch "));
    const branch = el("code", "", data.state?.branch || head.branch || "main");
    copy.append(branch);
  } else {
    copy.textContent = "No backup head yet. The first backup will become the top node.";
  }
  card.append(copy);

  const stats = el("p", "backup-stat-row");
  stats.append(stat("Collections", current.totalCollections ?? 0));
  stats.append(stat("Documents", current.totalDocs ?? 0));
  if (current.error) stats.append(stat("Stats error", current.error));
  card.append(stats);

  const names = Object.keys(collections).sort();
  if (names.length) {
    const details = el("details", "backup-collections");
    details.append(el("summary", "", "Collection counts"));
    const list = el("ul");
    for (const name of names) {
      list.append(el("li", "", `${name}: ${collections[name]}`));
    }
    details.append(list);
    card.append(details);
  }

  host.append(card);
}

function stat(label, value) {
  const node = el("span");
  node.append(document.createTextNode(`${label}: `));
  node.append(el("b", "", String(value)));
  return node;
}

function renderTree(data) {
  const host = document.querySelector("#backup-tree");
  const empty = document.querySelector("#backup-empty");
  const note = document.querySelector("#backup-head-note");
  if (!host) return;
  host.replaceChildren();

  const backups = Array.isArray(data.backups) ? data.backups : [];
  const stateInfo = data.state || {};
  const headId = stateInfo.head || null;

  if (note) {
    note.textContent = headId
      ? `Head: ${headId} · Branch: ${stateInfo.branch || "main"}`
      : "No head node yet.";
  }
  if (empty) empty.hidden = backups.length > 0;
  if (backups.length === 0) return;

  const byId = new Map(backups.map((backup) => [backup.id, backup]));
  const trunkIds = [];
  const seen = new Set();
  let cursor = headId ? byId.get(headId) : null;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    trunkIds.push(cursor.id);
    cursor = cursor.parent ? byId.get(cursor.parent) : null;
  }
  const trunkSet = new Set(trunkIds);

  const branchGroups = new Map();
  const orphans = [];
  for (const backup of backups) {
    if (trunkSet.has(backup.id)) continue;
    let parentId = backup.parent || null;
    const guard = new Set();
    while (parentId && !trunkSet.has(parentId) && !guard.has(parentId)) {
      guard.add(parentId);
      parentId = byId.get(parentId)?.parent || null;
    }
    if (!parentId || !trunkSet.has(parentId)) {
      orphans.push(backup);
      continue;
    }
    const key = `${parentId}\u0000${backup.branch || "main"}`;
    let group = branchGroups.get(key);
    if (!group) {
      group = { pointId: parentId, branch: backup.branch || "main", nodes: [] };
      branchGroups.set(key, group);
    }
    group.nodes.push(backup);
  }

  const trunk = el("div", "backup-trunk");
  for (const id of trunkIds) {
    const backup = byId.get(id);
    const row = el("div", "backup-row");
    row.append(renderNode(backup, false, headId));
    const groups = [...branchGroups.values()]
      .filter((group) => group.pointId === id)
      .sort((a, b) => newestTime(b.nodes) - newestTime(a.nodes));
    if (groups.length) {
      const branchList = el("div", "backup-branch-list");
      for (const group of groups) {
        const groupBox = el("div", "backup-branch-group");
        const label = el("p", "backup-branch-label");
        label.append(document.createTextNode("branch "));
        label.append(el("code", "", group.branch));
        groupBox.append(label);
        group.nodes
          .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt))
          .forEach((branchNode) => groupBox.append(renderNode(branchNode, true, headId)));
        branchList.append(groupBox);
      }
      row.append(branchList);
    }
    trunk.append(row);
  }
  host.append(trunk);

  if (orphans.length) {
    const groupBox = el("div", "backup-branch-list");
    groupBox.append(el("p", "backup-branch-label", "detached snapshots"));
    orphans
      .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt))
      .forEach((backup) => groupBox.append(renderNode(backup, true, headId)));
    host.append(groupBox);
  }
}

function newestTime(nodes) {
  return Math.max(0, ...nodes.map((node) => dateValue(node.createdAt)));
}

function renderNode(backup, isBranch, headId) {
  const classes = ["backup-node"];
  if (isBranch) classes.push("branch-node");
  if (backup.id === headId) classes.push("head");
  if (state.selected?.id === backup.id) classes.push("picked");
  const card = el("article", classes.join(" "));

  const top = el("div", "backup-node-top");
  top.append(el("span", `backup-badge ${badgeClass(backup.kind)}`, kindLabel(backup.kind)));
  if (backup.id === headId) top.append(el("span", "backup-badge head", "HEAD"));
  top.append(el("span", "backup-node-time", formatDate(backup.createdAt)));
  card.append(top);

  card.append(el("p", "backup-node-branch", `branch ${backup.branch || "main"} · id ${backup.id}`));

  const meta = el("p", "backup-node-meta");
  meta.append(metaPart("Collections", backup.collectionCount ?? 0));
  meta.append(metaPart("Documents", backup.totalDocs ?? "?"));
  meta.append(metaPart("Size", formatBytes(backup.totalSize || 0)));
  if (backup.by) meta.append(metaPart("By", backup.by));
  card.append(meta);

  const parent = el("p", "backup-node-parent");
  if (backup.parent) {
    parent.append(document.createTextNode("Parent: "));
    parent.append(el("code", "", backup.parent));
  } else {
    parent.textContent = "Root node · no parent";
  }
  card.append(parent);

  if (backup.legacy) {
    card.append(el("p", "backup-node-parent", "Legacy snapshot: no manifest, so collection counts are unknown."));
  }
  if (backup.manifestError) {
    card.append(el("p", "backup-node-parent", `Manifest error: ${backup.manifestError}`));
  }
  if (backup.missingFiles?.length) {
    card.append(el("p", "backup-node-parent", `Missing files: ${backup.missingFiles.join(", ")}`));
  }

  const actions = el("div", "backup-node-actions");
  const button = el("button", "backup-restore-button", "Restore this backup");
  button.type = "button";
  if (!backup.restorable) {
    button.textContent = "Incomplete backup";
    button.disabled = true;
  } else if (backup.id === headId) {
    button.textContent = "Current head";
    button.disabled = true;
  } else if (!secretReady(state.data)) {
    button.textContent = "DSCONFIRM not set";
    button.disabled = true;
  } else if (state.data?.lock?.active) {
    button.textContent = "Locked";
    button.disabled = true;
  } else {
    button.addEventListener("click", () => selectForRestore(backup));
  }
  actions.append(button);
  card.append(actions);

  return card;
}

function metaPart(label, value) {
  const node = el("span");
  node.append(document.createTextNode(`${label}: `));
  node.append(el("b", "", String(value)));
  return node;
}

function badgeClass(kind) {
  if (kind === "scheduled") return "scheduled";
  if (kind === "pre-restore") return "pre-restore";
  if (kind === "after-restore") return "after-restore";
  if (kind === "incomplete") return "incomplete";
  if (kind === "legacy") return "legacy";
  return "manual";
}

function kindLabel(kind) {
  if (kind === "scheduled") return "Daily 02:00";
  if (kind === "pre-restore") return "Safety before restore";
  if (kind === "after-restore") return "After restore";
  if (kind === "incomplete") return "Incomplete";
  if (kind === "legacy") return "Legacy";
  return "Manual";
}

function formatMoment(value) {
  if (!value) return "unknown";
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return String(value);
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(value) {
  return value ? formatMoment(value) : "Unknown time";
}

function dateValue(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : 0;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function selectForRestore(backup) {
  if (state.busy || state.data?.lock?.active) return;
  state.selected = backup;
  render();
  const panel = document.querySelector("#restore-panel");
  if (panel) {
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.querySelector("#restore-confirm")?.focus();
}

function closeRestore() {
  if (state.busy) return;
  state.selected = null;
  const input = document.querySelector("#restore-confirm");
  const check = document.querySelector("#restore-understand");
  if (input) input.value = "";
  if (check) check.checked = false;
  const error = document.querySelector("#restore-error");
  if (error) error.hidden = true;
  render();
}

function renderRestorePanel() {
  const panel = document.querySelector("#restore-panel");
  if (!panel) return;
  if (!state.selected) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const target = document.querySelector("#restore-target");
  if (target) {
    target.textContent = `Target: ${formatDate(state.selected.createdAt)} · ${state.selected.id}`;
  }
  const error = document.querySelector("#restore-error");
  if (error) error.hidden = true;
}

async function backUpNow() {
  if (state.busy || !state.data?.configured || !secretReady()) return;
  if (state.data?.lock?.active) {
    showPageToast("Release the current backup lock first.", "warn");
    return;
  }
  const secretInput = document.querySelector("#backup-secret");
  const secret = secretInput?.value || "";
  if (!secret) {
    showPageToast("Enter the DSCONFIRM secret before backing up.", "warn");
    secretInput?.focus();
    return;
  }
  state.busy = true;
  syncButtons();
  setStatus("Backing up the full database…");
  showLog([`[${new Date().toLocaleTimeString()}] Manual backup started.`]);
  try {
    const data = await request("backup-now", { confirm: secret });
    state.data = data.tree;
    state.selected = null;
    if (secretInput) secretInput.value = "";
    render();
    showPageToast(`Backup ${data.backup?.id || ""} complete.`, "ok");
    showLog([
      `[${new Date().toLocaleTimeString()}] Manual backup complete.`,
      `id: ${data.backup?.id || "unknown"}`,
      `collections: ${data.backup?.collectionCount ?? "?"}`,
      `documents: ${data.backup?.totalDocs ?? "?"}`,
    ]);
  } catch (err) {
    if (err.data?.lock && state.data) {
      state.data.lock = { exists: true, active: true, expired: false, ...err.data.lock };
      render();
    }
    showPageToast(err.message || "Backup failed.", "warn");
    showLog([`[${new Date().toLocaleTimeString()}] Backup failed.`, err.message]);
  } finally {
    state.busy = false;
    syncButtons();
    setStatus("");
  }
}

async function restoreSelected() {
  if (state.busy || !state.selected || state.data?.lock?.active) return;
  const input = document.querySelector("#restore-confirm");
  const understood = document.querySelector("#restore-understand");
  const error = document.querySelector("#restore-error");
  const code = input?.value || "";
  if (!code) {
    showRestoreError("Enter the DSCONFIRM value.");
    return;
  }
  if (!understood?.checked) {
    showRestoreError("Tick the confirmation box first.");
    return;
  }

  const target = state.selected;
  state.busy = true;
  if (error) error.hidden = true;
  syncButtons();
  setStatus("Creating safety snapshot, then restoring…");
  showLog([
    `[${new Date().toLocaleTimeString()}] Restore started.`,
    `target: ${target.id}`,
    "Step 1/3: back up the current database.",
    "Step 2/3: replace the live database.",
    "Step 3/3: write the after-restore snapshot and start a new branch.",
  ]);

  try {
    const data = await request("restore", {
      backupId: target.id,
      confirm: code,
    });
    state.data = data.tree || state.data;
    state.selected = null;
    if (input) input.value = "";
    if (understood) understood.checked = false;
    render();
    setStatus("Restore complete.");
    showPageToast(`Restore complete. New branch: ${data.branch}`, "ok");

    const lines = [
      `[${new Date().toLocaleTimeString()}] Restore complete.`,
      `restored from: ${data.restoredFrom}`,
      `safety snapshot: ${data.safetyBackup?.id || "unknown"}`,
      `after-restore snapshot: ${data.afterRestoreBackup?.id || "not created"}`,
      `new branch: ${data.branch}`,
      `collections restored: ${data.collectionsRestored}`,
      `collections dropped: ${data.collectionsDropped}`,
      `documents restored: ${data.totalDocs}`,
    ];
    if (data.stateError) lines.push(`warning: ${data.stateError}`);
    showLog(lines);
  } catch (err) {
    if (err.data?.lock && state.data) {
      state.data.lock = { exists: true, active: true, expired: false, ...err.data.lock };
      render();
    }
    showRestoreError(err.message || "Restore failed.");
    const lines = [
      `[${new Date().toLocaleTimeString()}] Restore failed.`,
      err.message,
    ];
    if (err.data?.safetyBackup?.id) {
      lines.push(`safety snapshot: ${err.data.safetyBackup.id}`);
      lines.push("The current database was snapshotted before the failure. You can restore that safety snapshot.");
    }
    if (Array.isArray(err.data?.results) && err.data.results.length) {
      lines.push("partial results:");
      for (const result of err.data.results) lines.push(`  ${result.collection}: ${result.action}`);
    }
    showLog(lines);
  } finally {
    state.busy = false;
    syncButtons();
    setStatus("");
  }
}

function showRestoreError(message) {
  const node = document.querySelector("#restore-error");
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
}

function showLog(lines) {
  const node = document.querySelector("#backup-log");
  if (!node) return;
  node.hidden = false;
  node.textContent = lines.join("\n");
}

if (requireAdmin()) {
  initNav("backups");
  bindToastClose();
  run();
}
