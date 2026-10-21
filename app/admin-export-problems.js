import { requireAdmin } from "../shared/session.js";
import { initNav } from "../shared/nav.js";
import { bindToastClose, showPageToast } from "../shared/toast.js";

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

function run() {
  const data = readExport();
  const box = document.querySelector("#export-text");
  const empty = document.querySelector("#export-empty");
  const copy = document.querySelector("#export-copy");
  const lead = document.querySelector("#export-lead");
  if (!data) {
    box.hidden = true;
    copy.hidden = true;
    empty.hidden = false;
    return;
  }
  const count = Number.isInteger(data.count) ? data.count : data.text.split("\n\n").length;
  lead.textContent = `${count} problem${count === 1 ? "" : "s"}. Each one starts with its question id.`;
  box.value = data.text;
  copy.addEventListener("click", () => { copyText().catch(() => showPageToast("Could not copy.", "warn")); });
}

if (requireAdmin()) {
  initNav("problems");
  bindToastClose();
  run();
}
