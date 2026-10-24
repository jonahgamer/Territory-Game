import { requireAdmin } from "../shared/session.js?v=roles";
import { initNav } from "../shared/nav.js?v=roles";
import { bindToastClose, showPageToast } from "../shared/toast.js";
import { api } from "../shared/api.js?v=page-data";
import { problemTag, typeInfo } from "../shared/difficulty.js";

const STORAGE_KEY = "territory-problem-export";

function readExport() {
  try {
    const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (!data || typeof data.text !== "string" || !data.text.trim()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseItems(value) {
  const items = [];
  for (const part of String(value || "").split(",")) {
    const split = part.lastIndexOf(":");
    if (split <= 0) continue;
    const type = part.slice(0, split);
    const index = Number(part.slice(split + 1));
    if (!typeInfo(type) || !Number.isInteger(index)) continue;
    items.push({ type, index });
  }
  return items;
}

function exportPlain(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script, style").forEach((node) => node.remove());
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, tr, blockquote").forEach((node) => node.append("\n"));
  return (doc.body?.textContent || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function textFor(problems, items) {
  return items.map((item) => {
    const problem = problems.find((p) => p.type === item.type && Number(p.index) === item.index);
    const tag = problemTag(item.index, item.type);
    if (!problem) return `${tag}\n(Missing problem)`;
    let body = "";
    try { body = exportPlain(problem.prompt); } catch { body = ""; }
    return `${tag}\n${body || "(No text)"}`;
  }).join("\n\n");
}

async function copyText() {
  const box = document.querySelector("#export-text");
  const text = box.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    box.focus();
    box.select();
    document.execCommand("copy");
  }
  showPageToast("Copied.", "ok");
}

function showExport(data) {
  const box = document.querySelector("#export-text");
  const copy = document.querySelector("#export-copy");
  const lead = document.querySelector("#export-lead");
  const count = Number.isInteger(data.count) ? data.count : data.text.split("\n\n").length;
  lead.textContent = `${count} problem${count === 1 ? "" : "s"}. Each one starts with its question id.`;
  box.hidden = false;
  copy.hidden = false;
  box.value = data.text;
  copy.addEventListener("click", () => { copyText().catch(() => showPageToast("Could not copy.", "warn")); });
}

function showEmpty(message) {
  const box = document.querySelector("#export-text");
  const empty = document.querySelector("#export-empty");
  const copy = document.querySelector("#export-copy");
  box.hidden = true;
  copy.hidden = true;
  empty.hidden = false;
  if (message) empty.textContent = message;
}

async function run() {
  const stored = readExport();
  if (stored) {
    showExport(stored);
    return;
  }
  const items = parseItems(new URLSearchParams(location.search).get("items"));
  if (!items.length) {
    showEmpty("No problems were exported. Go back and select some first.");
    return;
  }
  const lead = document.querySelector("#export-lead");
  if (lead) lead.textContent = "Loading selected problems…";
  try {
    const data = await api.problemText(items);
    showExport({ count: items.length, text: textFor(data.problems, items) });
  } catch (err) {
    showEmpty(err.message || "Could not load the selected problems.");
  }
}

if (requireAdmin()) {
  initNav("problems");
  bindToastClose();
  run();
}
