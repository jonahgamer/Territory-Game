import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { loadBootstrap } from "../shared/data.js";
import { api } from "../shared/api.js";
import { el, renderList, debounce } from "../shared/dom.js";
import {
  PROBLEM_PAGE_SIZE, YEAR_INDEX_START, YEAR_INDEX_END,
  DIFFICULTY_NAME, DIFFICULTIES, DIFFICULTY_SCORE,
} from "../shared/constants.js";
import { typeInfo, problemDifficulty, problemTag } from "../shared/difficulty.js";

// ── 顶层状态 ─────────────────────────────────────────────
const state = {
  problems: [],
  revisions: { problems: 0, maps: 0 },
  activeType: "math",
  query: "",
  difficultyFilter: "all",
  sortMode: "index",
  page: 1,
  selectMode: false,
  selected: new Set(),
  maps: [],
};

// 防止 addProblem 被连续点击时并发请求
let addProblemBusy = false;

// ── 数据加载 ─────────────────────────────────────────────
async function refreshData() {
  const data = await loadBootstrap();
  state.problems = data.problems;
  state.maps = data.maps;
  state.revisions = data.revisions;
}

// ── 启动 ─────────────────────────────────────────────────
async function run() {
  try {
    await refreshData();
  } catch (err) {
    const le = document.querySelector("#load-error");
    if (le) { le.hidden = false; le.textContent = err.message; }
    return;
  }
  bindEvents();
  render();
}

// ── 事件绑定 ─────────────────────────────────────────────
function bindEvents() {
  document.querySelector("#problem-section-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-section]");
    if (!btn || !typeInfo(btn.dataset.section)) return;
    state.activeType = btn.dataset.section;
    state.page = 1;
    state.query = "";
    state.difficultyFilter = "all";
    state.selectMode = false;
    state.selected.clear();
    const search = document.querySelector("#problem-search");
    if (search) search.value = "";
    render();
  });

  document.querySelector("#problem-search")?.addEventListener("input", debounce(() => {
    state.query = document.querySelector("#problem-search").value.trim();
    state.page = 1;
    state.selected.clear();
    render();
  }, 150));

  document.querySelector("#problem-difficulty-filter")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-problem-difficulty-filter]");
    if (!btn) return;
    state.difficultyFilter = btn.dataset.problemDifficultyFilter;
    state.page = 1;
    state.selected.clear();
    render();
  });

  document.querySelector("#problem-sort")?.addEventListener("change", () => {
    const value = document.querySelector("#problem-sort").value;
    if (!["index", "index-desc", "difficulty"].includes(value)) return;
    state.sortMode = value;
    state.page = 1;
    render();
  });

  document.querySelector("#problem-select-toggle")?.addEventListener("click", () => {
    state.selectMode = !state.selectMode;
    if (!state.selectMode) state.selected.clear();
    render();
  });

  document.querySelector("#problem-section")?.addEventListener("click", onListClick);
  document.querySelector("#problem-section")?.addEventListener("change", onSelectionChange);

  document.querySelector("#problem-select-page")?.addEventListener("change", (event) => {
    for (const box of document.querySelectorAll("[data-select-problem]")) {
      box.checked = event.target.checked;
      const key = `${box.dataset.selectType}:${box.dataset.selectProblem}`;
      if (box.checked) state.selected.add(key);
      else state.selected.delete(key);
    }
    syncSelection();
  });

  document.querySelector("#problem-select-all")?.addEventListener("change", (event) => {
    for (const p of filteredProblems()) {
      const key = `${p.type}:${p.index}`;
      if (event.target.checked) state.selected.add(key);
      else state.selected.delete(key);
    }
    for (const box of document.querySelectorAll("[data-select-problem]")) {
      box.checked = event.target.checked;
    }
    syncSelection();
  });

  document.querySelector("#problem-bulk-difficulty")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-bulk-difficulty]");
    if (!btn || btn.disabled) return;
    const d = btn.dataset.bulkDifficulty;
    const chosen = selectedProblems();
    if (!DIFFICULTIES.includes(d) || chosen.length === 0) return;
    const label = chosen.length === 1 ? problemTag(chosen[0].index, chosen[0].type) : `${chosen.length} problems`;
    if (!window.confirm(`Set ${label} to ${DIFFICULTY_NAME[d]}?`)) return;
    for (const p of chosen) p.difficulty = d;
    await persistProblems();
    render();
  });

  document.querySelector("#problem-bulk-delete")?.addEventListener("click", async () => {
    const chosen = selectedProblems();
    if (chosen.length === 0) return;
    if (!window.confirm(`Delete ${chosen.length} problem${chosen.length === 1 ? "" : "s"}? They will also be cleared from every map.`)) return;
    const keys = new Set(chosen.map((p) => `${p.type}:${p.index}`));
    state.problems = state.problems.filter((p) => !keys.has(`${p.type}:${p.index}`));
    for (const map of state.maps) {
      map.cells.forEach((cell, i) => {
        if (cell.kind === "problem" && keys.has(`${cell.type}:${cell.problemNo}`)) map.cells[i] = { kind: "empty" };
      });
    }
    state.selected.clear();
    await persistProblems();
    await persistMaps();
    render();
  });

  document.querySelector("#add-problem")?.addEventListener("click", () => {
    addProblem(state.activeType);
  });

  document.querySelector("#batch-add-problem")?.addEventListener("click", () => {
    location.assign(`/admin/problem-batch.html?type=${encodeURIComponent(state.activeType)}`);
  });

  // 从 bfcache 恢复时（浏览器后退），重新拉一次数据，
  // 避免用户看到旧列表、算出旧 index
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    try {
      await refreshData();
      render();
    } catch (err) {
      console.error("[pageshow reload]", err);
    }
  });
}

// ── 添加题目（异步刷新后计算 index） ─────────────────────
async function addProblem(type) {
  if (addProblemBusy) return;
  const problemType = typeInfo(type) ? type : "math";
  addProblemBusy = true;

  const btn = document.querySelector("#add-problem");
  if (btn) btn.disabled = true;

  try {
    // 关键：先拉最新数据，保证 nextProblemNo 基于最新题目集合
    await refreshData();
    render();

    const index = nextProblemNo(problemType);
    if (index === null) {
      showPageToast(
        `Every index from ${YEAR_INDEX_START} to ${YEAR_INDEX_END} is already used for ${typeInfo(problemType).name}.`,
        "warn"
      );
      return;
    }
    location.assign(`/admin/problem-editor.html?type=${encodeURIComponent(problemType)}&index=${index}`);
  } catch (err) {
    showPageToast(err.message || "Could not open the problem editor.", "warn");
  } finally {
    addProblemBusy = false;
    if (btn) btn.disabled = false;
  }
}

// ── 工具 ─────────────────────────────────────────────────
function nextProblemNo(type) {
  const used = new Set();
  for (const p of state.problems) if (p.type === type) used.add(p.index);
  for (const map of state.maps) for (const c of map.cells || []) {
    if (c?.kind === "problem" && c.type === type) used.add(c.problemNo);
  }
  for (let i = YEAR_INDEX_START; i <= YEAR_INDEX_END; i += 1) {
    if (!used.has(i)) return i;
  }
  return null;
}

function filteredProblems() {
  const all = state.problems.filter((p) => p.type === state.activeType);
  const q = state.query.trim().toLowerCase();
  const filtered = all.filter((p) => {
    if (state.difficultyFilter !== "all" && problemDifficulty(p) !== state.difficultyFilter) return false;
    if (!q) return true;
    const haystack = [problemTag(p.index, p.type), String(p.index), plainText(p.prompt), plainText(p.answer)].join(" ").toLowerCase();
    return haystack.includes(q);
  });
  if (state.sortMode === "index-desc") filtered.sort((a, b) => b.index - a.index || a.type.localeCompare(b.type));
  else if (state.sortMode === "difficulty") filtered.sort((a, b) => DIFFICULTY_SCORE[problemDifficulty(b)] - DIFFICULTY_SCORE[problemDifficulty(a)] || a.index - b.index);
  else filtered.sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));
  return filtered;
}

function plainText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectedProblems() {
  return state.problems.filter((p) => p.type === state.activeType && state.selected.has(`${p.type}:${p.index}`));
}

function problemUsage(index, type) {
  let cells = 0;
  const mapIds = new Set();
  for (const map of state.maps) {
    for (const c of map.cells || []) {
      if (c.kind === "problem" && c.problemNo === index && c.type === type) {
        cells += 1;
        mapIds.add(map.id);
      }
    }
  }
  return { cells, maps: mapIds.size };
}

// ── 渲染 ─────────────────────────────────────────────────
function render() {
  for (const btn of document.querySelectorAll("[data-section]")) {
    const type = typeInfo(btn.dataset.section);
    if (!type) continue;
    const count = state.problems.filter((p) => p.type === type.id).length;
    btn.dataset.count = String(count);
    btn.setAttribute("aria-label", `${type.name}, ${count} problems`);
    btn.setAttribute("aria-pressed", String(btn.dataset.section === state.activeType));
  }

  const type = typeInfo(state.activeType);
  const section = document.querySelector("#problem-section");
  if (!type || !section) return;
  section.hidden = false;

  const titleEl = document.querySelector("#problem-section-title");
  titleEl.replaceChildren();
  titleEl.textContent = type.name;
  titleEl.append(el("span", "problem-tag", type.tag));

  const all = state.problems.filter((p) => p.type === type.id);
  const matching = filteredProblems();
  const pageCount = Math.max(1, Math.ceil(matching.length / PROBLEM_PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pageCount);
  const start = (state.page - 1) * PROBLEM_PAGE_SIZE;
  const visible = matching.slice(start, start + PROBLEM_PAGE_SIZE);
  const filtering = Boolean(state.query) || state.difficultyFilter !== "all";

  const countEl = document.querySelector("#problem-count");
  if (matching.length === 0) {
    countEl.textContent = filtering ? `No matches in ${all.length} problems` : "No problems yet";
  } else {
    const end = Math.min(start + visible.length, matching.length);
    countEl.textContent = filtering
      ? `Showing ${start + 1}–${end} of ${matching.length} matches (${all.length} total)`
      : `Showing ${start + 1}–${end} of ${matching.length}`;
  }

  const toggle = document.querySelector("#problem-select-toggle");
  toggle.hidden = all.length === 0;
  toggle.setAttribute("aria-pressed", String(state.selectMode));
  toggle.textContent = state.selectMode ? "Done" : "Select";

  const bulk = document.querySelector("#problem-bulk");
  bulk.hidden = !state.selectMode || all.length === 0;

  const empty = document.querySelector("#problem-empty");
  empty.hidden = matching.length > 0;
  empty.textContent = all.length === 0 ? `No ${type.name} problems yet.` : "No problems match this search and filter.";

  const list = document.querySelector("#problem-list");
  list.hidden = visible.length === 0;
  renderList(list, visible, createProblemRow);

  for (const btn of document.querySelectorAll("[data-problem-difficulty-filter]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.problemDifficultyFilter === state.difficultyFilter));
  }
  document.querySelector("#problem-sort").value = state.sortMode;

  renderPages(pageCount);
  syncSelection();
}

function createProblemRow(problem) {
  const tag = problemTag(problem.index, problem.type);
  const level = problemDifficulty(problem);
  const usage = problemUsage(problem.index, problem.type);
  const item = el("li", state.selectMode ? "problem-row selecting" : "problem-row");

  const main = el("div", "problem-row-main");

  if (state.selectMode) {
    const check = el("label", "problem-check");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.selectProblem = String(problem.index);
    cb.dataset.selectType = problem.type;
    cb.checked = state.selected.has(`${problem.type}:${problem.index}`);
    cb.setAttribute("aria-label", `Select ${tag}`);
    check.append(cb);
    main.append(check);
  }

  const openBtn = el("button", "open-problem");
  openBtn.type = "button";
  openBtn.setAttribute("aria-label", `Edit ${tag}`);
  openBtn.append(
    el("span", `problem-key ${problem.type}`, tag),
    el("span", `difficulty-chip ${level}`, DIFFICULTY_NAME[level]),
    el("span", "problem-snippet", plainText(problem.prompt) || "(empty)")
  );
  openBtn.addEventListener("click", () => {
    location.assign(`/admin/problem-editor.html?type=${encodeURIComponent(problem.type)}&index=${problem.index}`);
  });
  main.append(openBtn);
  item.append(main);

  const second = el("div", "problem-row-second");
  second.append(el("p", `problem-usage-chip ${usage.cells > 0 ? "" : "unused"}`,
    usage.cells > 0
      ? `${usage.maps} map${usage.maps === 1 ? "" : "s"} · ${usage.cells} cell${usage.cells === 1 ? "" : "s"}`
      : "Not placed"));
  if (!state.selectMode) {
    const actions = el("div", "problem-row-actions");
    const edit = el("button", "account-action", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => {
      location.assign(`/admin/problem-editor.html?type=${encodeURIComponent(problem.type)}&index=${problem.index}`);
    });
    const dup = el("button", "account-action", "Duplicate");
    dup.type = "button";
    dup.addEventListener("click", () => duplicateProblem(problem));
    const del = el("button", "account-action danger", "Delete");
    del.type = "button";
    del.addEventListener("click", () => deleteProblem(problem));
    actions.append(edit, dup, del);
    second.append(actions);
  }
  item.append(second);
  return item;
}

async function duplicateProblem(source) {
  // 先刷新，保证 nextProblemNo 是最新的
  try {
    await refreshData();
  } catch (err) {
    showPageToast(err.message || "Could not refresh problems.", "warn");
    return;
  }
  const nextIndex = nextProblemNo(source.type);
  if (nextIndex === null) { showPageToast("No free index.", "warn"); return; }
  const copy = { ...source, index: nextIndex };
  state.problems.push(copy);
  state.problems.sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));
  const ok = await persistProblems();
  if (!ok) return;
  location.assign(`/admin/problem-editor.html?type=${encodeURIComponent(copy.type)}&index=${nextIndex}`);
}

async function deleteProblem(problem) {
  const tag = problemTag(problem.index, problem.type);
  const usage = problemUsage(problem.index, problem.type);
  const where = usage.cells > 0
    ? `It is placed on ${usage.maps} map${usage.maps === 1 ? "" : "s"} in ${usage.cells} cells, which will be cleared.`
    : "It is not placed on any map.";
  if (!window.confirm(`Delete ${tag}?\n\n${where}`)) return;
  state.problems = state.problems.filter((p) => !(p.index === problem.index && p.type === problem.type));
  for (const map of state.maps) {
    map.cells.forEach((cell, i) => {
      if (cell.kind === "problem" && cell.problemNo === problem.index && cell.type === problem.type) {
        map.cells[i] = { kind: "empty" };
      }
    });
  }
  await persistProblems();
  await persistMaps();
  render();
}

function onListClick(event) {
  if (!state.selectMode) return;
  const row = event.target.closest(".problem-row");
  if (!row || event.target.closest(".problem-check")) return;
  const box = row.querySelector("[data-select-problem]");
  if (box) { box.checked = !box.checked; onSelectionChange({ target: box }); }
}

function onSelectionChange(event) {
  const box = event.target.closest("[data-select-problem]");
  if (!box) return;
  const key = `${box.dataset.selectType}:${box.dataset.selectProblem}`;
  if (box.checked) state.selected.add(key);
  else state.selected.delete(key);
  syncSelection();
}

function syncSelection() {
  const boxes = [...document.querySelectorAll("[data-select-problem]")];
  const onPage = boxes.filter((b) => b.checked).length;
  const matching = filteredProblems();
  const chosen = selectedProblems();
  const pageBox = document.querySelector("#problem-select-page");
  if (pageBox) {
    pageBox.checked = boxes.length > 0 && onPage === boxes.length;
    pageBox.indeterminate = onPage > 0 && onPage < boxes.length;
  }
  const allBox = document.querySelector("#problem-select-all");
  if (allBox) {
    allBox.checked = matching.length > 0 && chosen.length === matching.length;
    allBox.indeterminate = chosen.length > 0 && chosen.length < matching.length;
  }
  const count = document.querySelector("#problem-selected-count");
  if (count) count.textContent = chosen.length === 0 ? "None selected" : `${chosen.length} selected`;
  const delBtn = document.querySelector("#problem-bulk-delete");
  if (delBtn) delBtn.disabled = chosen.length === 0;
  for (const btn of document.querySelectorAll("[data-bulk-difficulty]")) btn.disabled = chosen.length === 0;
}

function renderPages(pageCount) {
  const container = document.querySelector("#problem-pages");
  container.replaceChildren();
  container.hidden = pageCount <= 1;
  if (pageCount <= 1) return;
  const add = (label, page, opts = {}) => {
    const btn = el("button", null, label);
    btn.type = "button";
    if (page !== null) btn.dataset.problemPage = String(page);
    if (opts.current) btn.setAttribute("aria-pressed", "true");
    if (opts.disabled) btn.disabled = true;
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      state.page = page;
      render();
    });
    container.append(btn);
  };
  add("‹ Prev", state.page - 1, { disabled: state.page <= 1 });
  const pages = new Set([1, pageCount]);
  for (let p = state.page - 2; p <= state.page + 2; p += 1) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }
  const ordered = [...pages].sort((a, b) => a - b);
  let prev = 0;
  for (const p of ordered) {
    if (prev && p - prev > 1) container.append(el("span", "page-gap", "…"));
    add(String(p), p, { current: p === state.page });
    prev = p;
  }
  add("Next ›", state.page + 1, { disabled: state.page >= pageCount });
}

async function persistProblems() {
  try {
    const data = await api.saveProblems(state.problems, state.revisions.problems);
    state.revisions.problems = data.revision;
    return true;
  } catch (err) {
    showPageToast(err.message || "Could not save problems.", "warn");
    return false;
  }
}

async function persistMaps() {
  try {
    const data = await api.saveMaps(state.maps, state.revisions.maps);
    state.revisions.maps = data.revision;
    return true;
  } catch (err) {
    showPageToast(err.message || "Could not save maps.", "warn");
    return false;
  }
}

// ── 启动（最后） ─────────────────────────────────────────
if (requireAdmin()) {
  initNav("problems");
  bindToastClose();
  run();
}