// app/admin-problem-upload.js
import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=account";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadPage } from "../shared/data.js?v=roles";
import { api } from "../shared/api.js?v=replace-batch";
import { el } from "../shared/dom.js";
import { MIN_PROBLEM_NO, MAX_PROBLEM_NO, PROBLEM_TYPES, DIFFICULTIES } from "../shared/constants.js";
import { typeInfo, difficultyScore, problemTag } from "../shared/difficulty.js";

const params = new URLSearchParams(location.search);
const backType = typeInfo(params.get("type")) ? params.get("type") : "math";

const TYPE_BY_TAG = new Map(PROBLEM_TYPES.map((item) => [item.tag, item.id]));
const TYPE_ORDER = new Map(PROBLEM_TYPES.map((item, index) => [item.id, index]));
const FILE_RE = /^([MOSPT])(\d+)\.(pro|ans|gra|dif)$/i;
const EXTS = ["pro", "ans", "gra"];

const state = {
  problems: [],
  reserved: [],
  revisions: { problems: 0 },
  // "type:index" -> { type, index, pro?: File, ans?: File, gra?: File }
  groups: new Map(),
  ignored: 0,
};

function groupKey(typeId, index) {
  return `${typeId}:${index}`;
}

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
  titleEl.textContent = "Upload problems";
  backEl.href = `/admin/problems.html?type=${encodeURIComponent(backType)}`;
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
    const key = btn.closest(".upload-row")?.dataset.key;
    if (key) state.groups.delete(key);
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
    const typeId = match ? TYPE_BY_TAG.get(match[1].toUpperCase()) : null;
    const index = match ? Number(match[2]) : NaN;
    if (!typeId || !Number.isInteger(index) || index < 1) {
      ignored += 1;
      continue;
    }
    const ext = match[3].toLowerCase();
    const key = groupKey(typeId, index);
    const group = state.groups.get(key) || { type: typeId, index };
    group[ext] = file;
    if (ext === "dif") group.difficulty = (await file.text()).trim().toLowerCase();
    state.groups.set(key, group);
    added += 1;
  }

  state.ignored = ignored;
  render();

  if (added) {
    showPageToast(`${added} file${added === 1 ? "" : "s"} added.`, "ok");
  }
  if (!added && ignored) {
    showError(
      "No usable files. Names must look like P26100.pro, M26001.ans or O26040.gra. " +
      "The letter is the type: M, O, S, P or T " +
      `(got ${ignored} other file${ignored === 1 ? "" : "s"}).`
    );
  }
}

/* --------------------------------------------------------------- render ---- */

function render() {
  listEl.innerHTML = "";
  const keys = [...state.groups.keys()].sort((a, b) => {
    const left = state.groups.get(a);
    const right = state.groups.get(b);
    return (TYPE_ORDER.get(left.type) - TYPE_ORDER.get(right.type)) || (left.index - right.index);
  });

  for (const key of keys) {
    const group = state.groups.get(key);
    const tag = problemTag(group.index, group.type);
    const row = el("div", "upload-row");
    row.dataset.key = key;

    row.append(el("span", "upload-tag", group.difficulty ? `${tag} · ${group.difficulty}` : tag));

    const filesEl = el("div", "upload-files");
    for (const ext of EXTS) {
      const file = group[ext];
      const chip = el("span", `upload-file ${file ? "is-ok" : "is-missing"}`, `.${ext}`);
      chip.title = file ? file.name : `missing ${tag}.${ext}`;
      filesEl.append(chip);
    }
    row.append(filesEl);

    const remove = el("button", "account-action danger", "Remove");
    remove.type = "button";
    remove.dataset.uploadRemove = "";
    row.append(remove);

    listEl.append(row);
  }

  const n = keys.length;
  countEl.hidden = n === 0;
  if (n) {
    const parts = [`${n} problem${n === 1 ? "" : "s"} ready`];
    const incomplete = keys.filter((key) => {
      const g = state.groups.get(key);
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

function readParts(prompt, answer) {
  const sections = [...prompt.matchAll(/<section data-part="([a-z])" data-marks="(\d+)">([\s\S]*?)<\/section>/gi)];
  if (!sections.length) return null;
  const answers = new Map();
  for (const line of answer.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-z]):\s*(.*)$/i);
    if (match) answers.set(match[1].toLowerCase(), match[2].trim());
  }
  const shared = prompt.replace(/<section\b[^>]*data-part=[\s\S]*?<\/section>/gi, "").trim();
  return {
    prompt: shared,
    parts: sections.map((section) => ({
      letter: section[1].toLowerCase(),
      score: Number(section[2]),
      prompt: section[3].trim(),
      answer: answers.get(section[1].toLowerCase()) || "",
    })),
  };
}

function confirmReplace(labels) {
  if (!labels.length) return false;
  const sample = labels.slice(0, 6).join(", ");
  const extra = labels.length > 6 ? ` and ${labels.length - 6} more` : "";
  const lead = labels.length === 1
    ? `${sample} already exists.`
    : `${labels.length} problems already exist: ${sample}${extra}.`;
  return window.confirm(`${lead} Replace ${labels.length === 1 ? "it" : "them"} with the new version${labels.length === 1 ? "" : "s"}?`);
}

function savedMessage(saved, replaced) {
  const added = saved - replaced;
  if (replaced && added) return `Added ${added} and replaced ${replaced}.`;
  if (replaced) return `Replaced ${replaced} problem${replaced === 1 ? "" : "s"}.`;
  return `Added ${added} problem${added === 1 ? "" : "s"}.`;
}

async function saveAll() {
  errorEl.hidden = true;
  const keys = [...state.groups.keys()];
  if (!keys.length) {
    showError("Add at least one problem.");
    return;
  }

  // Structure + duplicate checks first, so we fail before reading files.
  for (const key of keys) {
    const group = state.groups.get(key);
    const label = problemTag(group.index, group.type);
    if (group.index < MIN_PROBLEM_NO || group.index > MAX_PROBLEM_NO) {
      showError(`${label}: index must be between ${MIN_PROBLEM_NO} and ${MAX_PROBLEM_NO}.`);
      return;
    }
    if (!group.pro) { showError(`${label}: missing .pro statement file.`); return; }
    if (!group.ans) { showError(`${label}: missing .ans answer file.`); return; }
  }

  const entries = [];
  for (const key of keys) {
    const group = state.groups.get(key);
    const label = problemTag(group.index, group.type);
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
    let difficulty = group.difficulty || "normal";
    if (group.dif && !group.difficulty) difficulty = (await readText(group.dif)).trim().toLowerCase();
    if (!DIFFICULTIES.includes(difficulty)) {
      showError(`${label}: difficulty must be easy, normal, hard, or insane.`);
      return;
    }
    const split = readParts(prompt, answer);
    if (split) {
      if (split.parts.some((part) => !part.answer || !Number.isInteger(part.score))) {
        showError(`${label}: each part needs a mark and an answer such as a:5.`);
        return;
      }
      const score = split.parts.reduce((sum, part) => sum + part.score, 0);
      entries.push({
        index: group.index,
        type: group.type,
        prompt: split.prompt,
        answer: split.parts.map((part) => part.answer).join("\n"),
        parts: split.parts.map((part) => ({ prompt: part.prompt, answer: part.answer, score: part.score })),
        logic,
        difficulty,
        score,
      });
      continue;
    }
    entries.push({
      index: group.index,
      type: group.type,
      prompt,
      answer: answer.trim(),
      logic,
      difficulty,
      score: difficultyScore(difficulty),
    });
  }

  const existing = entries.filter((entry) => state.problems.some((p) => p.type === entry.type && p.index === entry.index));
  const replace = confirmReplace(existing.map((entry) => problemTag(entry.index, entry.type)));
  const saving = replace ? entries : entries.filter((entry) => !existing.includes(entry));
  if (!saving.length) {
    showPageToast("Nothing was added. The existing problems were left as they are.", "warn");
    return;
  }

  saveBtn.disabled = true;
  try {
    const data = await api.addProblems(saving, state.revisions.problems, replace && existing.length > 0);
    state.revisions.problems = data.revision;
    showPageToast(savedMessage(saving.length, replace ? existing.length : 0), "ok");
    const savedTypes = new Set(entries.map((item) => item.type));
    const destType = savedTypes.size === 1 ? entries[0].type : backType;
    location.assign(`/admin/problems.html?type=${encodeURIComponent(destType)}`);
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