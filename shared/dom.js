export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function qs(selector, root = document) { return root.querySelector(selector); }
export function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

export function renderList(container, items, createNode) {
  if (!container) return;
  container.replaceChildren();
  for (const item of items) {
    const node = createNode(item);
    if (node) container.append(node);
  }
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function formatAccountDate(ms, empty = "Unknown") {
  if (!Number.isFinite(ms)) return empty;
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return empty; }
}

export function confirmTwice(first, second) {
  return window.confirm(first) && window.confirm(second);
}