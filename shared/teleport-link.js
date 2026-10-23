const NS = "http://www.w3.org/2000/svg";
const COLORS = ["#3ee0ff", "#ffd24a", "#7dffb3", "#ff8ad4", "#c9a6ff", "#ff9a4a"];
const stored = new WeakMap();
const watchers = new WeakMap();
const busy = new WeakSet();

export function drawTeleportLinks(container, pairs) {
  if (!container) return;
  const list = Array.isArray(pairs) ? pairs : [];
  stored.set(container, list);
  ensureWatcher(container);
  paint(container, list);
  requestAnimationFrame(() => {
    if (stored.get(container) === list) paint(container, list);
  });
}

function ensureWatcher(container) {
  if (watchers.has(container)) return;
  const observer = new ResizeObserver(() => {
    const pairs = stored.get(container);
    if (pairs) paint(container, pairs);
  });
  observer.observe(container);
  watchers.set(container, observer);
}

function paint(container, pairs) {
  if (busy.has(container)) return;
  busy.add(container);
  try {
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    let svg = container.querySelector(":scope > .teleport-links");
    if (!pairs.length) {
      svg?.remove();
      return;
    }
    if (!svg) {
      svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "teleport-links");
      svg.setAttribute("aria-hidden", "true");
      svg.style.position = "absolute";
      svg.style.left = "0";
      svg.style.top = "0";
      svg.style.overflow = "visible";
      svg.style.pointerEvents = "none";
      svg.style.zIndex = "4";
      container.append(svg);
    }
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.replaceChildren();
    pairs.forEach((pair, index) => {
      const a = findCell(container, pair?.a);
      const b = findCell(container, pair?.b);
      if (!a || !b) return;
      const pa = center(container, a);
      const pb = center(container, b);
      const color = COLORS[index % COLORS.length];
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = Math.min(72, Math.max(28, len * 0.18));
      const nx = -dy / len;
      const ny = dx / len;
      const control = { x: (pa.x + pb.x) / 2 + nx * bend, y: (pa.y + pb.y) / 2 + ny * bend };
      svg.append(
        curve(pa, control, pb, "#041018", 7),
        curve(pa, control, pb, color, 3),
        ring(pa, color),
        ring(pb, color),
        caption(
          (pa.x + 2 * control.x + pb.x) / 4 + nx * 16,
          (pa.y + 2 * control.y + pb.y) / 4 + ny * 16,
          String(pair.label || index + 1),
          color,
        ),
      );
    });
    if (container.lastElementChild !== svg) container.append(svg);
  } finally {
    busy.delete(container);
  }
}

function findCell(container, end) {
  if (!end || typeof end.mapId !== "string" || !Number.isInteger(end.cell)) return null;
  return container.querySelector(`[data-map="${CSS.escape(end.mapId)}"][data-index="${end.cell}"]`);
}

function center(container, el) {
  const box = el.getBoundingClientRect();
  const host = container.getBoundingClientRect();
  const scaleX = host.width / container.offsetWidth || 1;
  const scaleY = host.height / container.offsetHeight || 1;
  return {
    x: (box.left + box.width / 2 - host.left) / scaleX,
    y: (box.top + box.height / 2 - host.top) / scaleY,
  };
}

function curve(a, control, b, stroke, width) {
  const node = document.createElementNS(NS, "path");
  node.setAttribute("d", `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`);
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", stroke);
  node.setAttribute("stroke-width", String(width));
  node.setAttribute("stroke-linecap", "round");
  return node;
}

function ring(point, color) {
  const node = document.createElementNS(NS, "circle");
  node.setAttribute("cx", String(point.x));
  node.setAttribute("cy", String(point.y));
  node.setAttribute("r", "6");
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", color);
  node.setAttribute("stroke-width", "3");
  return node;
}

function caption(x, y, label, color) {
  const node = document.createElementNS(NS, "text");
  node.setAttribute("x", String(x));
  node.setAttribute("y", String(y));
  node.setAttribute("text-anchor", "middle");
  node.setAttribute("dominant-baseline", "middle");
  node.setAttribute("fill", color);
  node.setAttribute("stroke", "#041018");
  node.setAttribute("stroke-width", "4");
  node.setAttribute("paint-order", "stroke");
  node.setAttribute("font-size", "14");
  node.setAttribute("font-weight", "700");
  node.textContent = label;
  return node;
}
