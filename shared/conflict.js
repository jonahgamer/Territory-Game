import { el } from "./dom.js";
import { showPageToast } from "./toast.js";

let saveConflictActive = false;
let conflictState = null;

export function isSaveConflictActive() { return saveConflictActive; }

const COLLECTION_LABELS = { maps: "Maps", problems: "Problems", contests: "Contests" };

const CONFLICT_FIELDS = {
  maps: [
    { key: "name", label: "Name" },
    { key: "mode", label: "Type" },
    { key: "geometry", label: "Size and cells" },
    { key: "backdrop", label: "View" },
    { key: "photo", label: "Photo" },
  ],
  problems: [
    { key: "prompt", label: "Problem" },
    { key: "answer", label: "Answer" },
    { key: "solution", label: "Solution" },
    { key: "logic", label: "Logic" },
    { key: "difficulty", label: "Difficulty" },
  ],
  contests: [
    { key: "name", label: "Name" },
    { key: "mapId", label: "Map" },
    { key: "startAt", label: "Start time" },
    { key: "durationMinutes", label: "Duration" },
    { key: "spawnMinutes", label: "Spawn time" },
    { key: "readyMinutes", label: "Wait after spawn" },
    { key: "spawnMode", label: "Spawn assignment" },
    { key: "energyRegen", label: "Energy restored" },
    { key: "energyRegenSeconds", label: "Energy restore interval" },
    { key: "energyAttemptCost", label: "Energy spent per attempt" },
    { key: "energyAttemptMin", label: "Minimum energy to attempt" },
    { key: "energySolveBelow", label: "Solve restore applies below" },
    { key: "energySolve", label: "Energy restored by difficulty" },
  ],
};

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function keyOf(name, item) { return name === "problems" ? `${item.type}:${item.index}` : String(item.id || ""); }
function label(name, item) {
  if (name === "maps") return `Map · ${item.name || item.id}`;
  if (name === "problems") return `Problem · ${item.type.toUpperCase()}${item.index}`;
  return `Contest · ${item.name || item.id}`;
}

function mapGeometry(map) { return { cols: map.cols, rows: map.rows, cells: map.cells }; }

function mapSummary(map) {
  const counts = mapKindCountsSafe(map);
  return `${map.cols}×${map.rows} · ${counts.problem} problems · ${counts.obstacle} obstacles · ${counts.spawnpoint} spawns · ${counts.empty} empty`;
}

function mapKindCountsSafe(map) {
  const c = { problem: 0, obstacle: 0, spawnpoint: 0, empty: 0 };
  for (const cell of map?.cells || []) {
    if (Object.prototype.hasOwnProperty.call(c, cell.kind)) c[cell.kind] += 1;
  }
  return c;
}

function cellKind(cell) {
  if (!cell) return "missing";
  if (cell.kind === "problem") return `${String(cell.type || "").toUpperCase()}${cell.problemNo}`;
  return cell.kind || "empty";
}

function changedCells(a, b) {
  const left = a?.cells || [];
  const right = b?.cells || [];
  const cols = a?.cols || b?.cols || 1;
  const items = [];
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    if (JSON.stringify(left[i]) !== JSON.stringify(right[i])) {
      items.push({
        index: i,
        row: Math.floor(i / cols) + 1,
        column: (i % cols) + 1,
        local: cellKind(left[i]),
        remote: cellKind(right[i]),
      });
    }
  }
  return { count: items.length, items };
}

function fieldValue(name, item, field) {
  if (name === "maps" && field === "geometry") return mapGeometry(item);
  return item?.[field];
}

function formatValue(name, field, value) {
  if (value === undefined || value === null) return "(empty)";
  if (name === "maps" && field === "mode") return value === "testing" ? "Testing" : "Official";
  if (name === "contests" && field === "spawnMode") return value === "random" ? "Random" : "Choose";
  if (name === "maps" && field === "backdrop") return value === "photo" ? "Photo" : "Terrain";
  if (name === "maps" && field === "photo") return value ? "Photo set" : "(none)";
  if (name === "maps" && field === "geometry") return mapSummary(value);
  if (field === "startAt" && Number.isFinite(Number(value))) {
    return `${new Date(Number(value)).toLocaleString()} (${value})`;
  }
  if (typeof value === "string") return value || "(empty)";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function buildRecords(name, localItems, remoteItems) {
  const localByKey = new Map(localItems.map((i) => [keyOf(name, i), i]));
  const remoteByKey = new Map(remoteItems.map((i) => [keyOf(name, i), i]));
  const keys = new Set([...localByKey.keys(), ...remoteByKey.keys()]);
  const records = [];
  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    if (!remote) { records.push({ key, kind: "added", local, remote: null, fields: [] }); continue; }
    if (!local) { records.push({ key, kind: "deleted", local: null, remote, fields: [] }); continue; }
    const fields = [];
    for (const field of CONFLICT_FIELDS[name]) {
      const lv = fieldValue(name, local, field.key);
      const rv = fieldValue(name, remote, field.key);
      if (JSON.stringify(lv) === JSON.stringify(rv)) continue;
      const item = { key: field.key, label: field.label, local: lv, remote: rv };
      if (name === "maps" && field.key === "geometry") {
        const diff = changedCells(lv, rv);
        item.changedCells = diff.count;
        item.cellDiffs = diff.items;
      }
      fields.push(item);
    }
    if (fields.length > 0) records.push({ key, kind: "changed", local, remote, fields });
  }
  records.sort((a, b) => {
    const ia = a.local || a.remote;
    const ib = b.local || b.remote;
    return label(name, ia).localeCompare(label(name, ib));
  });
  return records;
}

function newChoice(record) {
  if (record.kind === "added") return { keep: true };
  if (record.kind === "deleted") return { keepServer: true };
  return {
    fields: Object.fromEntries(record.fields.map((f) => [f.key, "local"])),
  };
}

function ensureModal() {
  let modal = document.querySelector("#conflict-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "conflict-modal";
  modal.className = "conflict-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "conflict-title");

  const dialog = el("section", "conflict-dialog");
  const header = el("header", "conflict-header");
  const title = el("h2");
  title.id = "conflict-title";
  title.textContent = "Resolve save conflict";
  const close = el("button", "conflict-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close conflict resolver");
  header.append(title, close);

  const body = el("div", "conflict-body");
  body.id = "conflict-body";

  const footer = el("footer", "conflict-footer");
  const error = el("p", "form-error");
  error.id = "conflict-error";
  error.hidden = true;
  const actions = el("div", "conflict-actions");
  const apply = el("button", "save-changes", "Apply choices & save");
  apply.id = "conflict-apply"; apply.type = "button";
  const server = el("button", "account-action", "Use server for all");
  server.id = "conflict-server"; server.type = "button";
  const mine = el("button", "account-action", "Keep mine for all");
  mine.id = "conflict-mine"; mine.type = "button";
  actions.append(apply, server, mine);
  footer.append(error, actions);

  dialog.append(header, body, footer);
  modal.append(dialog);
  document.body.append(modal);

  close.addEventListener("click", () => closeConflictModal());
  return modal;
}

function setBusy(busy) {
  for (const id of ["#conflict-apply", "#conflict-server", "#conflict-mine", "#conflict-close"]) {
    const b = document.querySelector(id);
    if (b) b.disabled = busy;
  }
}

function setError(message) {
  const error = document.querySelector("#conflict-error");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message || "";
}

function radio(name, value, checked, onChange, labelText) {
  const labelEl = el("label", "conflict-choice");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.addEventListener("change", () => { if (input.checked) onChange(value); });
  labelEl.append(input, document.createTextNode(labelText || value));
  return labelEl;
}

function valueBlock(kind, labelText, value, name, field) {
  const block = el("div", `conflict-value conflict-value-${kind}`);
  const title = el("span", "conflict-value-title", `${kind === "local" ? "+" : "-"} ${labelText}`);
  const pre = el("pre", null, formatValue(name, field, value));
  block.append(title, pre);
  return block;
}

function renderRecords() {
  const state = conflictState;
  if (!state) return;
  const body = document.querySelector("#conflict-body");
  const title = document.querySelector("#conflict-title");
  if (!body) return;
  if (title) title.textContent = `${COLLECTION_LABELS[state.collection]} conflict`;

  body.replaceChildren();
  const intro = el("p", "conflict-intro", state.focused
    ? "Another admin saved first. This only shows the page you have open. Everything else stays as the server saved it."
    : "Another admin saved first. Choose what to keep. Nothing is overwritten until you apply.");
  body.append(intro);

  if (state.records.length === 0) {
    body.append(el("p", "conflict-empty", "No content differences were found."));
    setBusy(false);
    const apply = document.querySelector("#conflict-apply");
    const mine = document.querySelector("#conflict-mine");
    if (apply) apply.disabled = true;
    if (mine) mine.disabled = true;
    return;
  }

  state.records.forEach((record, index) => {
    const item = record.local || record.remote;
    const card = el("article", "conflict-record");
    card.dataset.conflictIndex = String(index);

    const head = el("div", "conflict-record-head");
    const heading = el("h3", null, label(state.collection, item));
    const badge = el("span", `conflict-badge conflict-badge-${record.kind}`,
      record.kind === "added" ? "Only mine"
        : record.kind === "deleted" ? "Only server"
        : `${record.fields.length} changed`);
    head.append(heading, badge);
    card.append(head);

    if (record.kind === "added" || record.kind === "deleted") {
      const summary = el("p", "conflict-record-summary",
        state.collection === "maps" ? mapSummary(item)
          : state.collection === "problems"
            ? (String(item.prompt || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220) || "(empty problem)")
            : `Starts ${new Date(Number(item.startAt)).toLocaleString()} · ${item.durationMinutes} min`);
      card.append(summary);
      const choices = el("div", "conflict-choices");
      const choice = state.choices[index];
      if (record.kind === "added") {
        choices.append(
          radio(`conflict-${index}`, "keep", choice.keep, (v) => { state.choices[index].keep = v === "keep"; }, "Keep my addition"),
          radio(`conflict-${index}`, "drop", !choice.keep, (v) => { state.choices[index].keep = v !== "drop"; }, "Drop it")
        );
      } else {
        choices.append(
          radio(`conflict-${index}`, "keepServer", choice.keepServer, (v) => { state.choices[index].keepServer = v === "keepServer"; }, "Keep server version"),
          radio(`conflict-${index}`, "delete", !choice.keepServer, (v) => { state.choices[index].keepServer = v !== "delete"; }, "Delete it")
        );
      }
      card.append(choices);
      body.append(card);
      return;
    }

    const actions = el("div", "conflict-record-actions");
    const useServer = el("button", "account-action", "Use server for this item");
    useServer.type = "button";
    const useMine = el("button", "account-action", "Use mine for this item");
    useMine.type = "button";
    actions.append(useMine, useServer);
    card.append(actions);

    for (const field of record.fields) {
      const fieldBox = el("div", "conflict-field");
      const fieldHead = el("div", "conflict-field-head");
      const labelEl = el("h4", null, field.label);
      const choices = el("div", "conflict-choices");
      const choice = state.choices[index].fields[field.key] || "local";
      const radioName = `conflict-${index}-${field.key}`;
      choices.append(
        radio(radioName, "local", choice === "local", (v) => { state.choices[index].fields[field.key] = v; }, "Mine"),
        radio(radioName, "remote", choice === "remote", (v) => { state.choices[index].fields[field.key] = v; }, "Server")
      );
      fieldHead.append(labelEl, choices);
      fieldBox.append(fieldHead);

      if (field.changedCells !== undefined) {
        fieldBox.append(el("p", "conflict-field-meta", `${field.changedCells} cell${field.changedCells === 1 ? "" : "s"} differ.`));
        if (field.cellDiffs?.length) {
          const list = el("div", "conflict-cell-diffs");
          for (const d of field.cellDiffs.slice(0, 30)) {
            list.append(el("div", "conflict-cell-diff",
              `R${d.row} C${d.column}: server ${d.remote} → mine ${d.local}`));
          }
          if (field.cellDiffs.length > 30) {
            list.append(el("div", "conflict-cell-diff conflict-cell-more",
              `…and ${field.cellDiffs.length - 30} more changed cells.`));
          }
          fieldBox.append(list);
        }
      }

      const diff = el("div", "conflict-diff");
      diff.append(
        valueBlock("server", "Server", field.remote, state.collection, field.key),
        valueBlock("local", "Mine", field.local, state.collection, field.key)
      );
      fieldBox.append(diff);
      card.append(fieldBox);
    }

    useServer.addEventListener("click", () => {
      for (const field of record.fields) {
        state.choices[index].fields[field.key] = "remote";
        card.querySelector(`input[name="conflict-${index}-${field.key}"][value="remote"]`).checked = true;
        card.querySelector(`input[name="conflict-${index}-${field.key}"][value="local"]`).checked = false;
      }
    });
    useMine.addEventListener("click", () => {
      for (const field of record.fields) {
        state.choices[index].fields[field.key] = "local";
        card.querySelector(`input[name="conflict-${index}-${field.key}"][value="local"]`).checked = true;
        card.querySelector(`input[name="conflict-${index}-${field.key}"][value="remote"]`).checked = false;
      }
    });

    body.append(card);
  });

  setBusy(false);
  setError("");
}

function applyField(name, target, local, remote, fieldKey, choice) {
  const source = choice === "local" ? local : remote;
  if (name === "maps" && fieldKey === "geometry") {
    target.cols = source.cols;
    target.rows = source.rows;
    target.cells = clone(source.cells);
    return;
  }
  target[fieldKey] = clone(source?.[fieldKey]);
}

function merge(mode) {
  const state = conflictState;
  if (!state) return [];
  const merged = new Map();
  for (const item of state.remoteItems) merged.set(keyOf(state.collection, item), clone(item));
  state.records.forEach((record, index) => {
    if (record.kind === "added") {
      const keep = mode === "mine" ? true : mode === "server" ? false : state.choices[index].keep;
      if (keep) merged.set(record.key, clone(record.local));
      return;
    }
    if (record.kind === "deleted") {
      const keepServer = mode === "server" ? true : mode === "mine" ? false : state.choices[index].keepServer;
      if (!keepServer) merged.delete(record.key);
      return;
    }
    const target = merged.get(record.key) || clone(record.remote);
    for (const field of record.fields) {
      const choice = mode === "mine" ? "local" : mode === "server" ? "remote" : (state.choices[index].fields[field.key] || "local");
      applyField(state.collection, target, record.local, record.remote, field.key, choice);
    }
    merged.set(record.key, target);
  });
  return [...merged.values()];
}

export async function openSaveConflict(options) {
  if (saveConflictActive) return;
  saveConflictActive = true;
  conflictState = { collection: options.collection, loading: true, records: [], choices: [] };

  const modal = ensureModal();
  const body = document.querySelector("#conflict-body");
  if (body) {
    body.replaceChildren(el("p", "conflict-loading",
      `Fetching the latest ${COLLECTION_LABELS[options.collection]} from the server…`));
  }
  setError("");
  setBusy(true);
  modal.hidden = false;

  try {
    const data = await options.api.bootstrap();
    const remoteItems = clone(data?.[options.collection] || []);
    const remoteRevision = data?.revisions?.[options.collection];
    if (!Number.isInteger(remoteRevision)) throw new Error("The server did not return a revision.");
    const localItems = clone(options.getLocal());
    const records = buildRecords(options.collection, localItems, remoteItems);
    const focus = options.focusKeys?.();
    const visible = focus ? records.filter((r) => focus.has(r.key)) : records;
    conflictState = {
      collection: options.collection,
      loading: false,
      focused: Boolean(focus),
      localItems, remoteItems, remoteRevision,
      records: visible,
      choices: visible.map(newChoice),
      options,
    };
    renderRecords();

    const apply = document.querySelector("#conflict-apply");
    const server = document.querySelector("#conflict-server");
    const mine = document.querySelector("#conflict-mine");
    if (apply) apply.onclick = () => applyConflict("choices");
    if (server) server.onclick = () => applyConflict("server");
    if (mine) mine.onclick = () => applyConflict("mine");
  } catch (err) {
    if (body) body.replaceChildren(el("p", "conflict-loading", `Could not load the latest server data: ${err.message}`));
    setError(err.message);
    setBusy(false);
  }
}

async function applyConflict(mode) {
  const state = conflictState;
  if (!state || state.loading) return;
  const merged = mode === "server" ? clone(state.remoteItems) : merge(mode);
  const options = state.options;

  options.setLocal(merged);
  options.setRevision(state.remoteRevision);
  setBusy(true);

  if (mode === "server") {
    closeConflictModal();
    options.refreshAfter?.();
    showPageToast("Using the server version.", "ok");
    return;
  }

  closeConflictModal();
  options.refreshAfter?.();
  try {
    const saved = await options.persist();
    if (saved) showPageToast("Conflict resolved and saved.", "ok");
    else showPageToast("Could not save after merging. Try again.", "warn");
  } catch (err) {
    showPageToast(err.message || "Could not save.", "warn");
  }
}

export function closeConflictModal() {
  const modal = document.querySelector("#conflict-modal");
  if (modal) modal.hidden = true;
  saveConflictActive = false;
  conflictState = null;
  setError("");
}