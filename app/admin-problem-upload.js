// app/admin-problem-upload.js
import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=page-data";
import { api } from "../shared/api.js?v=page-data";
import { el } from "../shared/dom.js";
import { MIN_PROBLEM_NO, MAX_PROBLEM_NO } from "../shared/constants.js";
import { typeInfo, difficultyScore } from "../shared/difficulty.js";

const params = new URLSearchParams(location.search);
const type = typeInfo(params.get("type")) ? params.get("type") : "math";

const FILE_RE = /^P(\d+)\.(pro|ans|gra)$/i;
const EXTS = ["pro", "ans", "gra"];

const state = {
  problems: [],
  reserved: [],
  revisions: { problems: 0 },
  // index -> { pro?: File, ans?: File, gra?: File }
  groups: new Map(),
  ignored: 0,
};

const dropZone = document.querySelector("#drop-zone");
const fileInput = document.querySelector("#file-input");
const folderInput = document.querySelector("#folder-input");
const listEl = document.querySelector("#upload-list");
const countEl = document.querySelector("#upload-count");
const errorEl = document.querySelector("#upload-error");
const titleEl = document.querySelector("#upload-title");
const backEl = document.querySelector("#upload-back");
const saveBtn = document.querySelector("#upload-save");

/* ---------------------------------------------------------------- load ---- */

async function run() {
  const data = await loadPage("page-problem-keys");
  state.problems = data.keys || [];
  state.reserved = data.reserved || [];
  state.revisions = data.revisions || { problems: 0 };
  titleEl.textContent = `Upload ${typeInfo(type).name} problems`;
  backEl.href = `/admin/problems.html?type=${encodeURIComponent(type)}`;
  render();
}

/* -------------------------------------------------------------- binding ---- */

function bindEvents() {
  document.querySelector("#pick-files")?.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  document.querySelector("#pick-folder")?.addEventListener("click", (e) => {
    e.stopPropagation();
    folderInput.click();
  });
  document.querySelector("#upload-clear")?.addEventListener("click", () => {
    state.groups.clear();
    state.ignored = 0;
    errorEl.hidden = true;
    render();
  });
  saveBtn?.addEventListener("click", saveAll);

  fileInput?.addEventListener("change", async () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    await addFiles(files);
  });
  folderInput?.addEventListener("change", async () => {
    const files = [...folderInput.files];
    folderInput.value = "";
    await addFiles(files);
  });

  listEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-upload-remove]");
    if (!btn) return;
    const index = Number(btn.closest(".upload-row")?.dataset.index);
    if (Number.isInteger(index)) state.groups.delete(index);
    render();
  });

  bindDropZone();
}

function bindDropZone() {
  if (!dropZone) return;
  dropZone.tabIndex = 0;

  dropZone.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    fileInput.click();
  });
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  for (const name of ["dragenter", "dragover", "dragleave"]) {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.toggle("is-dragging", name !== "dragleave");
    });
  }

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("is-dragging");
    if (!e.dataTransfer) return;
    try {
      await addFiles(await filesFromDataTransfer(e.dataTransfer));
    } catch (err) {
      showError(err.message || "Could not read dropped files.");
    }
  });

  // Stop the browser from navigating to a dropped file if the drop misses the zone.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}

/* ------------------------------------------------------- drop traversal ---- */

async function filesFromDataTransfer(dt) {
  const items = dt.items ? [...dt.items] : [];
  const entries = [];
  for (const item of items) {
    if (item.kind !== "file" || typeof item.webkitGetAsEntry !== "function") continue;
    const entry = item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }
  if (!entries.length) return [...dt.files];

  const out = [];
  for (const entry of entries) await collectEntry(entry, out);
  return out.length ? out : [...dt.files];
}

function collectEntry(entry, out) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => { out.push(file); resolve(); }, () => resolve());
      return;
    }
    if (!entry.isDirectory) {
      resolve();
      return;
    }
    const reader = entry.createReader();
    const readBatch = () => {
      reader.readEntries(async (batch) => {
        if (!batch.length) { resolve(); return; }
        for (const child of batch) await collectEntry(child, out);
        readBatch();
      }, () => resolve());
    };
    readBatch();
  });
}

/* --------------------------------------------------------------- ingest ---- */

async function addFiles(fileList) {
  errorEl.hidden = true;
  const files = [...fileList];
  if (!files.length) return;

  let added = 0;
  let ignored = 0;

  for (const file of files) {
    const match = FILE_RE.exec((file.name || "").trim());
    const index = match ? Number(match[1]) : NaN;
    if (!match || !Number.isInteger(index) || index < 1) {
      ignored += 1;
      continue;
    }
    const ext = match[2].toLowerCase();
    const group = state.groups.get(index) || {};
    group[ext] = file;
    state.groups.set(index, group);
    added += 1;
  }

  state.ignored = ignored;
  render();

  if (added) {
    showPageToast(`${added} file${added === 1 ? "" : "s"} added.`, "ok");
  }
  if (!added && ignored) {
    showError(
      `No usable files. Names must look like P<number>.pro, P<number>.ans or P<number>.gra ` +
      `(got ${ignored} other file${ignored === 1 ? "" : "s"}).`
    );
  }
}

/* --------------------------------------------------------------- render ---- */

function render() {
  listEl.innerHTML = "";
  const indices = [...state.groups.keys()].sort((a, b) => a - b);

  for (const index of indices) {
    const group = state.groups.get(index);
    const row = el("div", "upload-row");
    row.dataset.index = String(index);

    row.append(el("span", "upload-tag", `${typeInfo(type).tag}${index}`));

    const filesEl = el("div", "upload-files");
    for (const ext of EXTS) {
      const file = group[ext];
      const chip = el("span", `upload-file ${file ? "is-ok" : "is-missing"}`, `.${ext}`);
      chip.title = file ? file.name : `missing P${index}.${ext}`;
      filesEl.append(chip);
    }
    row.append(filesEl);

    const remove = el("button", "account-action danger", "Remove");
    remove.type = "button";
    remove.dataset.uploadRemove = "";
    row.append(remove);

    listEl.append(row);
  }

  const n = indices.length;
  countEl.hidden = n === 0;
  if (n) {
    const parts = [`${n} problem${n === 1 ? "" : "s"} ready`];
    const incomplete = indices.filter((i) => {
      const g = state.groups.get(i);
      return !g.pro || !g.ans;
    }).length;
    if (incomplete) parts.push(`${incomplete} missing .pro/.ans`);
    if (state.ignored) parts.push(`${state.ignored} file${state.ignored === 1 ? "" : "s"} ignored`);
    countEl.textContent = parts.join(" · ");
  }
  saveBtn.disabled = n === 0;
}

/* ---------------------------------------------------------------- save ----- */

function showError(msg) {
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

async function readText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsText(file);
  });
}

async function saveAll() {
  errorEl.hidden = true;
  const indices = [...state.groups.keys()].sort((a, b) => a - b);
  if (!indices.length) {
    showError("Add at least one problem.");
    return;
  }

  // Structure + duplicate checks first, so we fail before reading files.
  for (const index of indices) {
    const group = state.groups.get(index);
    const label = `${typeInfo(type).tag}${index}`;
    if (index < MIN_PROBLEM_NO || index > MAX_PROBLEM_NO) {
      showError(`${label}: index must be between ${MIN_PROBLEM_NO} and ${MAX_PROBLEM_NO}.`);
      return;
    }
    if (!group.pro) { showError(`${label}: missing .pro statement file.`); return; }
    if (!group.ans) { showError(`${label}: missing .ans answer file.`); return; }
    if (state.problems.some((p) => p.type === type && p.index === index)) {
      showError(`${label}: already exists.`);
      return;
    }
  }

  const entries = [];
  for (const index of indices) {
    const group = state.groups.get(index);
    const label = `${typeInfo(type).tag}${index}`;
    let prompt = "";
    let answer = "";
    let logic = "";
    try {
      prompt = await readText(group.pro);
      answer = await readText(group.ans);
      if (group.gra) logic = await readText(group.gra);
    } catch (err) {
      showError(`${label}: could not read file (${err.message || "unknown error"}).`);
      return;
    }
    if (!prompt.trim()) { showError(`${label}: statement file is empty.`); return; }
    if (!answer.trim()) { showError(`${label}: answer file is empty.`); return; }
    entries.push({
      index,
      type,
      prompt,
      answer,
      logic,
      difficulty: "normal",
      score: difficultyScore("normal"),
    });
  }

  saveBtn.disabled = true;
  try {
    const data = await api.addProblems(entries, state.revisions.problems);
    state.revisions.problems = data.revision;
    showPageToast(`${entries.length} problem${entries.length === 1 ? "" : "s"} added.`, "ok");
    location.assign(`/admin/problems.html?type=${encodeURIComponent(type)}`);
  } catch (err) {
    saveBtn.disabled = false;
    showError(err.message || "Could not save.");
  }
}

/* ---------------------------------------------------------------- init ----- */

if (requireAdmin()) {
  initNav("problems");
  bindToastClose();
  bindEvents();
  run().catch((err) => {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message; }
  });
}