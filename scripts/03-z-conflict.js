// ═══════════════════════════════════════════════════════════════════
// Save conflict resolution
// ═══════════════════════════════════════════════════════════════════

let saveConflictActive = false;
let conflictState = null;

const CONFLICT_COLLECTION_LABELS = {
  maps: "Maps",
  problems: "Problems",
  contests: "Contests",
};

const CONFLICT_FIELDS = {
  maps: [
    { key: "name", label: "Name" },
    { key: "mode", label: "Type" },
    { key: "geometry", label: "Size and cells" },
  ],
  problems: [
    { key: "prompt", label: "Problem" },
    { key: "answer", label: "Answer" },
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
  ],
};

function conflictClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function conflictCollection(name) {
  if (name === "maps") return maps;
  if (name === "problems") return problems;
  return contests;
}

function conflictSetCollection(name, value) {
  if (name === "maps") maps = value;
  else if (name === "problems") problems = value;
  else contests = value;
}

function conflictFocusKeys(collection) {
  if (collection === "maps" && editorView && !editorView.hidden && openMapId) {
    return new Set([String(openMapId)]);
  }
  if (collection === "problems" && problemEditorView && !problemEditorView.hidden && editingProblemType && Number.isInteger(editingProblemNo)) {
    return new Set([`${editingProblemType}:${editingProblemNo}`]);
  }
  if (collection === "problems" && batchView && !batchView.hidden && batchRows) {
    const keys = new Set();
    for (const row of batchRows.querySelectorAll("[data-batch-index]")) {
      const index = Number(row.value);
      if (Number.isInteger(index) && batchType) keys.add(`${batchType}:${index}`);
    }
    if (keys.size > 0) return keys;
  }
  if (collection === "contests" && contestView && !contestView.hidden && openContestId) {
    return new Set([String(openContestId)]);
  }
  return null;
}

function conflictKey(name, item) {
  if (name === "problems") return `${item.type}:${item.index}`;
  return String(item.id || "");
}

function conflictProblemTag(item) {
  if (typeof problemTag === "function") return problemTag(item.index, item.type);
  return `${String(item.type || "").toUpperCase()}${item.index}`;
}

function conflictLabel(name, item) {
  if (name === "maps") return `Map · ${item.name || item.id}`;
  if (name === "problems") return `Problem · ${conflictProblemTag(item)}`;
  return `Contest · ${item.name || item.id}`;
}

function conflictMapGeometry(map) {
  return { cols: map.cols, rows: map.rows, cells: map.cells };
}

function conflictMapSummary(map) {
  const counts = typeof mapKindCounts === "function"
    ? mapKindCounts(map)
    : { problem: 0, obstacle: 0, spawnpoint: 0, empty: 0 };
  return `${map.cols}×${map.rows} · ${counts.problem} problems · ${counts.obstacle} obstacles · ${counts.spawnpoint} spawns · ${counts.empty} empty`;
}

function conflictCellKind(cell) {
  if (!cell) return "missing";
  if (cell.kind === "problem") return `${String(cell.type || "").toUpperCase()}${cell.problemNo}`;
  return cell.kind || "empty";
}

function conflictChangedCells(a, b) {
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
        local: conflictCellKind(left[i]),
        remote: conflictCellKind(right[i]),
      });
    }
  }
  return { count: items.length, items };
}

function conflictFieldValue(name, item, field) {
  if (name === "maps" && field === "geometry") return conflictMapGeometry(item);
  return item?.[field];
}

function conflictFormatValue(name, field, value) {
  if (value === undefined || value === null) return "(empty)";
  if (name === "maps" && field === "mode") return value === "testing" ? "Testing" : "Official";
  if (name === "maps" && field === "geometry") return conflictMapSummary(value);
  if (field === "startAt" && Number.isFinite(Number(value))) {
    return `${new Date(Number(value)).toLocaleString()} (${value})`;
  }
  if (typeof value === "string") return value || "(empty)";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function conflictItemSummary(name, item) {
  if (name === "maps") return conflictMapSummary(item);
  if (name === "problems") {
    const prompt = String(item.prompt || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return prompt ? prompt.slice(0, 220) : "(empty problem)";
  }
  return `Starts ${new Date(Number(item.startAt)).toLocaleString()} · ${item.durationMinutes} min · spawn ${item.spawnMinutes} · wait ${item.readyMinutes}`;
}

function conflictValuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function conflictBuildRecords(name, localItems, remoteItems) {
  const localByKey = new Map(localItems.map((item) => [conflictKey(name, item), item]));
  const remoteByKey = new Map(remoteItems.map((item) => [conflictKey(name, item), item]));
  const keys = new Set([...localByKey.keys(), ...remoteByKey.keys()]);
  const records = [];

  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    if (!remote) {
      records.push({ key, kind: "added", local, remote: null, fields: [] });
      continue;
    }
    if (!local) {
      records.push({ key, kind: "deleted", local: null, remote, fields: [] });
      continue;
    }
    const fields = [];
    for (const field of CONFLICT_FIELDS[name]) {
      const localValue = conflictFieldValue(name, local, field.key);
      const remoteValue = conflictFieldValue(name, remote, field.key);
      if (conflictValuesEqual(localValue, remoteValue)) continue;
      const item = {
        key: field.key,
        label: field.label,
        local: localValue,
        remote: remoteValue,
      };
      if (name === "maps" && field.key === "geometry") {
        const cellDiff = conflictChangedCells(localValue, remoteValue);
        item.changedCells = cellDiff.count;
        item.cellDiffs = cellDiff.items;
      }
      fields.push(item);
    }
    if (fields.length > 0) records.push({ key, kind: "changed", local, remote, fields });
  }

  records.sort((a, b) => {
    const aItem = a.local || a.remote;
    const bItem = b.local || b.remote;
    return conflictLabel(name, aItem).localeCompare(conflictLabel(name, bItem));
  });
  return records;
}

function conflictNewChoice(record) {
  if (record.kind === "added") return { keep: true };
  if (record.kind === "deleted") return { keepServer: true };
  return {
    fields: Object.fromEntries(record.fields.map((field) => [field.key, "local"])),
  };
}

function ensureConflictModal() {
  let modal = document.querySelector("#conflict-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "conflict-modal";
  modal.className = "conflict-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "conflict-title");

  const dialog = document.createElement("section");
  dialog.className = "conflict-dialog";

  const header = document.createElement("header");
  header.className = "conflict-header";
  const title = document.createElement("h2");
  title.id = "conflict-title";
  title.textContent = "Resolve save conflict";
  const close = document.createElement("button");
  close.id = "conflict-close";
  close.type = "button";
  close.className = "conflict-close";
  close.setAttribute("aria-label", "Close conflict resolver");
  close.textContent = "×";
  header.append(title, close);

  const body = document.createElement("div");
  body.id = "conflict-body";
  body.className = "conflict-body";

  const footer = document.createElement("footer");
  footer.className = "conflict-footer";
  const error = document.createElement("p");
  error.id = "conflict-error";
  error.className = "form-error";
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "conflict-actions";
  const apply = document.createElement("button");
  apply.id = "conflict-apply";
  apply.type = "button";
  apply.className = "save-changes";
  apply.textContent = "Apply choices & save";
  const server = document.createElement("button");
  server.id = "conflict-server";
  server.type = "button";
  server.className = "account-action";
  server.textContent = "Use server for all";
  const mine = document.createElement("button");
  mine.id = "conflict-mine";
  mine.type = "button";
  mine.className = "account-action";
  mine.textContent = "Keep mine for all";
  actions.append(apply, server, mine);
  footer.append(error, actions);

  dialog.append(header, body, footer);
  modal.append(dialog);
  document.body.append(modal);

  close.addEventListener("click", () => closeConflictModal());
  apply.addEventListener("click", () => applyConflict("choices"));
  server.addEventListener("click", () => applyConflict("server"));
  mine.addEventListener("click", () => applyConflict("mine"));
  return modal;
}

function setConflictBusy(busy) {
  for (const id of ["#conflict-apply", "#conflict-server", "#conflict-mine", "#conflict-close"]) {
    const button = document.querySelector(id);
    if (button) button.disabled = busy;
  }
}

function setConflictError(message) {
  const error = document.querySelector("#conflict-error");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message || "";
}

function showConflictLoading(collection) {
  const modal = ensureConflictModal();
  const body = document.querySelector("#conflict-body");
  const title = document.querySelector("#conflict-title");
  if (title) title.textContent = "Resolve save conflict";
  if (body) {
    body.replaceChildren();
    const p = document.createElement("p");
    p.className = "conflict-loading";
    p.textContent = `Fetching the latest ${CONFLICT_COLLECTION_LABELS[collection] || "data"} from the server…`;
    body.append(p);
  }
  setConflictError("");
  setConflictBusy(true);
  modal.hidden = false;
}

function conflictRadio(name, value, checked, onChange, labelText) {
  const label = document.createElement("label");
  label.className = "conflict-choice";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.addEventListener("change", () => {
    if (input.checked) onChange(value);
  });
  label.append(input, document.createTextNode(labelText || value));
  return label;
}

function conflictValueBlock(kind, labelText, value, name, field) {
  const block = document.createElement("div");
  block.className = `conflict-value conflict-value-${kind}`;
  const title = document.createElement("span");
  title.className = "conflict-value-title";
  title.textContent = `${kind === "local" ? "+" : "-"} ${labelText}`;
  const pre = document.createElement("pre");
  pre.textContent = conflictFormatValue(name, field, value);
  block.append(title, pre);
  return block;
}

function renderConflictRecords() {
  const state = conflictState;
  if (!state) return;
  const body = document.querySelector("#conflict-body");
  const title = document.querySelector("#conflict-title");
  if (!body) return;
  if (title) title.textContent = `${CONFLICT_COLLECTION_LABELS[state.collection]} conflict`;

  body.replaceChildren();
  const intro = document.createElement("p");
  intro.className = "conflict-intro";
  intro.textContent = state.focused
    ? "Another admin saved first. This only shows the page you have open. Everything else stays as the server saved it."
    : "Another admin saved first. Choose what to keep. Nothing is overwritten until you apply.";
  body.append(intro);

  if (state.records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "conflict-empty";
    empty.textContent = "No content differences were found. The other change may only affect server-managed team or game state.";
    body.append(empty);
    setConflictBusy(false);
    const apply = document.querySelector("#conflict-apply");
    const mine = document.querySelector("#conflict-mine");
    if (apply) apply.disabled = true;
    if (mine) mine.disabled = true;
    return;
  }

  state.records.forEach((record, index) => {
    const item = record.local || record.remote;
    const card = document.createElement("article");
    card.className = "conflict-record";
    card.dataset.conflictIndex = String(index);

    const head = document.createElement("div");
    head.className = "conflict-record-head";
    const heading = document.createElement("h3");
    heading.textContent = conflictLabel(state.collection, item);
    const badge = document.createElement("span");
    badge.className = `conflict-badge conflict-badge-${record.kind}`;
    badge.textContent = record.kind === "added"
      ? "Only mine"
      : record.kind === "deleted"
        ? "Only server"
        : `${record.fields.length} changed`;
    head.append(heading, badge);
    card.append(head);

    if (record.kind === "added" || record.kind === "deleted") {
      const summary = document.createElement("p");
      summary.className = "conflict-record-summary";
      summary.textContent = conflictItemSummary(state.collection, item);
      card.append(summary);
      const choices = document.createElement("div");
      choices.className = "conflict-choices";
      const choice = state.choices[index];
      if (record.kind === "added") {
        choices.append(
          conflictRadio(`conflict-${index}`, "keep", choice.keep, (value) => {
            state.choices[index].keep = value === "keep";
          }, "Keep my addition"),
          conflictRadio(`conflict-${index}`, "drop", !choice.keep, (value) => {
            state.choices[index].keep = value !== "drop";
          }, "Drop it")
        );
      } else {
        choices.append(
          conflictRadio(`conflict-${index}`, "keepServer", choice.keepServer, (value) => {
            state.choices[index].keepServer = value === "keepServer";
          }, "Keep server version"),
          conflictRadio(`conflict-${index}`, "delete", !choice.keepServer, (value) => {
            state.choices[index].keepServer = value !== "delete";
          }, "Delete it")
        );
      }
      card.append(choices);
      body.append(card);
      return;
    }

    const actions = document.createElement("div");
    actions.className = "conflict-record-actions";
    const useServer = document.createElement("button");
    useServer.type = "button";
    useServer.className = "account-action";
    useServer.textContent = "Use server for this item";
    const useMine = document.createElement("button");
    useMine.type = "button";
    useMine.className = "account-action";
    useMine.textContent = "Use mine for this item";
    actions.append(useMine, useServer);
    card.append(actions);

    for (const field of record.fields) {
      const fieldBox = document.createElement("div");
      fieldBox.className = "conflict-field";
      const fieldHead = document.createElement("div");
      fieldHead.className = "conflict-field-head";
      const label = document.createElement("h4");
      label.textContent = field.label;
      const choices = document.createElement("div");
      choices.className = "conflict-choices";
      const fieldChoice = state.choices[index].fields[field.key] || "local";
      const radioName = `conflict-${index}-${field.key}`;
      choices.append(
        conflictRadio(radioName, "local", fieldChoice === "local", (value) => {
          state.choices[index].fields[field.key] = value;
        }, "Mine"),
        conflictRadio(radioName, "remote", fieldChoice === "remote", (value) => {
          state.choices[index].fields[field.key] = value;
        }, "Server")
      );
      fieldHead.append(label, choices);
      fieldBox.append(fieldHead);

      if (field.changedCells !== undefined) {
        const meta = document.createElement("p");
        meta.className = "conflict-field-meta";
        meta.textContent = `${field.changedCells} cell${field.changedCells === 1 ? "" : "s"} differ.`;
        fieldBox.append(meta);
        if (field.cellDiffs?.length) {
          const list = document.createElement("div");
          list.className = "conflict-cell-diffs";
          for (const item of field.cellDiffs.slice(0, 30)) {
            const line = document.createElement("div");
            line.className = "conflict-cell-diff";
            line.textContent = `R${item.row} C${item.column}: server ${item.remote} → mine ${item.local}`;
            list.append(line);
          }
          if (field.cellDiffs.length > 30) {
            const more = document.createElement("div");
            more.className = "conflict-cell-diff conflict-cell-more";
            more.textContent = `…and ${field.cellDiffs.length - 30} more changed cells.`;
            list.append(more);
          }
          fieldBox.append(list);
        }
      }

      const diff = document.createElement("div");
      diff.className = "conflict-diff";
      diff.append(
        conflictValueBlock("server", "Server", field.remote, state.collection, field.key),
        conflictValueBlock("local", "Mine", field.local, state.collection, field.key)
      );
      fieldBox.append(diff);
      card.append(fieldBox);
    }

    useServer.addEventListener("click", () => {
      for (const field of record.fields) {
        state.choices[index].fields[field.key] = "remote";
        const input = card.querySelector(`input[name="conflict-${index}-${field.key}"][value="remote"]`);
        if (input) input.checked = true;
        const localInput = card.querySelector(`input[name="conflict-${index}-${field.key}"][value="local"]`);
        if (localInput) localInput.checked = false;
      }
    });
    useMine.addEventListener("click", () => {
      for (const field of record.fields) {
        state.choices[index].fields[field.key] = "local";
        const input = card.querySelector(`input[name="conflict-${index}-${field.key}"][value="local"]`);
        if (input) input.checked = true;
        const remoteInput = card.querySelector(`input[name="conflict-${index}-${field.key}"][value="remote"]`);
        if (remoteInput) remoteInput.checked = false;
      }
    });

    body.append(card);
  });

  setConflictBusy(false);
  setConflictError("");
}

function conflictApplyField(name, target, local, remote, fieldKey, choice) {
  const source = choice === "local" ? local : remote;
  if (name === "maps" && fieldKey === "geometry") {
    target.cols = source.cols;
    target.rows = source.rows;
    target.cells = conflictClone(source.cells);
    return;
  }
  target[fieldKey] = conflictClone(source?.[fieldKey]);
}

function conflictMerge(mode) {
  const state = conflictState;
  if (!state) return [];
  const merged = new Map();
  for (const item of state.remoteItems) {
    merged.set(conflictKey(state.collection, item), conflictClone(item));
  }
  state.records.forEach((record, index) => {
    if (record.kind === "added") {
      const keep = mode === "mine" ? true : mode === "server" ? false : state.choices[index].keep;
      if (keep) merged.set(record.key, conflictClone(record.local));
      return;
    }
    if (record.kind === "deleted") {
      const keepServer = mode === "server" ? true : mode === "mine" ? false : state.choices[index].keepServer;
      if (!keepServer) merged.delete(record.key);
      return;
    }
    const target = merged.get(record.key) || conflictClone(record.remote);
    for (const field of record.fields) {
      const choice = mode === "mine"
        ? "local"
        : mode === "server"
          ? "remote"
          : state.choices[index].fields[field.key] || "local";
      conflictApplyField(state.collection, target, record.local, record.remote, field.key, choice);
    }
    merged.set(record.key, target);
  });
  return [...merged.values()];
}
function conflictClearDirty(collection) {
  if (collection === "maps") {
    mapDirty = false;
    mapSnapshot = currentMap() ? conflictClone(currentMap()) : null;
    updateMapSaveButton();
  } else if (collection === "problems") {
    problemDirty = false;
    if (problemDraft && !problemDraft.isNew) {
      const current = findProblem(problemDraft.index, problemDraft.type);
      problemDraft = current ? { ...conflictClone(current), isNew: false } : null;
    }
    updateProblemSaveButton();
  }
}

function refreshAfterConflict(collection) {
  if (collection === "maps") {
    if (editorView && !editorView.hidden) {
      const map = currentMap();
      if (!map) {
        if (typeof showMaps === "function") showMaps();
        return;
      }
      mapSnapshot = conflictClone(map);
      mapDirty = false;
      updateMapSaveButton();
      renderEditor();
    } else if (mapsView && !mapsView.hidden) {
      renderMaps();
    }
    return;
  }
  if (collection === "problems") {
    if (problemEditorView && !problemEditorView.hidden) {
      const current = findProblem(editingProblemNo, editingProblemType);
      if (!current) {
        problemDraft = null;
        problemDirty = false;
        if (typeof showProblems === "function") showProblems();
        return;
      }
      problemDraft = { ...conflictClone(current), isNew: false };
      problemDirty = false;
      renderProblemEditor();
      updateProblemSaveButton();
    } else if (problemsView && !problemsView.hidden) {
      renderProblems();
    }
    return;
  }
  if (typeof refreshOpenContest === "function" && contestView && !contestView.hidden) {
    refreshOpenContest();
  } else if (competitionsView && !competitionsView.hidden) {
    renderCompetitions();
  }
}

async function persistConflictCollection(collection) {
  if (collection === "maps") return persistMapsNow();
  if (collection === "problems") return persistProblemsNow();
  return persistContestsNow();
}

async function applyConflict(mode) {
  const state = conflictState;
  if (!state || state.loading) return;
  const merged = mode === "server" ? conflictClone(state.remoteItems) : conflictMerge(mode);
  if (state.collection === "contests" && typeof contestSchedule === "function" && !merged.every(contestSchedule)) {
    setConflictError("That combination makes an invalid schedule. Choose another combination.");
    return;
  }

  const collection = state.collection;
  conflictSetCollection(collection, merged);
  revisions[collection] = state.remoteRevision;
  setConflictBusy(true);

  if (mode === "server") {
    closeConflictModal();
    conflictClearDirty(collection);
    refreshAfterConflict(collection);
    showPageToast("Using the server version.", "ok");
    return;
  }

  closeConflictModal();
  conflictClearDirty(collection);
  refreshAfterConflict(collection);
  const saved = await persistConflictCollection(collection);
  if (saved) {
    showPageToast("Conflict resolved and saved.", "ok");
  } else if (collection === "maps") {
    mapDirty = true;
    updateMapSaveButton();
  } else if (collection === "problems") {
    problemDirty = true;
    updateProblemSaveButton();
  }
}

function closeConflictModal() {
  const modal = document.querySelector("#conflict-modal");
  if (modal) modal.hidden = true;
  saveConflictActive = false;
  conflictState = null;
  setConflictError("");
}

async function openSaveConflict(collection) {
  if (saveConflictActive || !isAdmin()) return;
  saveConflictActive = true;
  conflictState = { collection, loading: true, records: [], localItems: [], remoteItems: [], choices: [] };
  showConflictLoading(collection);
  try {
    const data = await apiCall("bootstrap");
    if (!conflictState || !saveConflictActive) return;
    const remoteItems = conflictClone(data?.[collection] || []);
    const remoteRevision = data?.revisions?.[collection];
    if (!Number.isInteger(remoteRevision)) throw new Error("The server did not return a revision for this collection.");
    const localItems = conflictClone(conflictCollection(collection));
    const records = conflictBuildRecords(collection, localItems, remoteItems);
    const focus = conflictFocusKeys(collection);
    const visible = focus ? records.filter((record) => focus.has(record.key)) : records;
    conflictState = {
      collection,
      loading: false,
      focused: Boolean(focus),
      localItems,
      remoteItems,
      remoteRevision,
      records: visible,
      choices: visible.map(conflictNewChoice),
    };
    renderConflictRecords();
  } catch (error) {
    console.error("[conflict]", error);
    const body = document.querySelector("#conflict-body");
    if (body) {
      body.replaceChildren();
      const p = document.createElement("p");
      p.className = "conflict-loading";
      p.textContent = `Could not load the latest server data: ${error.message}`;
      body.append(p);
    }
    setConflictError(error.message);
    setConflictBusy(false);
  }
}
