// ──────────────────────────────────────────────────────────
// PAN + ZOOM
// ──────────────────────────────────────────────────────────

// Controls inside the board that must never start a pan/pinch.
const PAN_IGNORE_SELECTOR =
  "#student-zoom-in, #student-zoom-out, #student-zoom-reset, [data-pan-ignore]";

function ensurePanZoomStyle() {
  if (document.querySelector("#student-pan-zoom-style")) return;
  const style = document.createElement("style");
  style.id = "student-pan-zoom-style";
  style.textContent = `
/* The map owns every touch that starts on it. touch-action does not
   inherit, and the grid contains scroll wrappers + cell buttons, so it
   has to be forced onto the descendants too. Without this the browser
   claims the two-finger gesture for page zoom and the map never sees it. */
#student-board,
#student-maps,
#student-maps * {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
`;
  document.head.append(style);
}

function installPanZoom() {
  const board = document.querySelector("#student-board");
  const grid  = document.querySelector("#student-maps");
  if (!board || !grid) return;

  board.style.position = "relative";
  board.style.overflow = "hidden";
  board.style.touchAction = "none";
  board.style.overscrollBehavior = "contain";
  board.style.cursor = "grab";
  board.style.userSelect = "none";

  grid.style.transformOrigin = "0 0";
  grid.style.willChange = "transform";
  grid.style.userSelect = "none";

  ensurePanZoomStyle();

  const applyView = () => {
    const { scale, x, y } = state.view;
    grid.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    refreshDotFontSizes();
  };
  state.applyView = applyView;

  // ── Geometry ───────────────────────────────────────────
  // The grid is translated + scaled about its own 0,0 corner, which is
  // almost never the board's top-left. Everything below converts through
  // the grid's *untransformed* offset inside the board, otherwise a pinch
  // zooms around the board's corner instead of around the fingers.
  const gridOffset = () => {
    const b = board.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    return {
      b,
      ox: g.left - b.left - state.view.x,   // untransformed grid origin
      oy: g.top  - b.top  - state.view.y,
    };
  };

  const zoomAt = (clientX, clientY, factor) => {
    const v = state.view;
    const nextScale = clamp(v.scale * factor, ZOOM_MIN, ZOOM_MAX);
    if (nextScale === v.scale) return;

    const { b, ox, oy } = gridOffset();           // read before mutating
    const px = clientX - b.left;
    const py = clientY - b.top;
    const localX = (px - ox - v.x) / v.scale;
    const localY = (py - oy - v.y) / v.scale;

    v.scale = nextScale;
    v.x = px - ox - localX * nextScale;
    v.y = py - oy - localY * nextScale;
    applyView();
  };

  // ── Wheel (desktop / trackpad pinch) ───────────────────
  board.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  }, { passive: false });

  // Older Safari fires proprietary gesture events for pinch and would
  // page-zoom instead of letting the pointer events through.
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    board.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }

  // ── Pointer bookkeeping ────────────────────────────────
  const pointers = new Map();
  const captured = new Set();
  let pinch = null;
  let dragging = false;
  let dragStart = null;
  let moved = false;

  const getMid = () => {
    const [a, c] = [...pointers.values()];
    return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  };
  const getDist = () => {
    const [a, c] = [...pointers.values()];
    return Math.hypot(a.x - c.x, a.y - c.y);
  };

  const capture = (id) => {
    if (captured.has(id)) return;
    try { board.setPointerCapture(id); captured.add(id); } catch {}
  };
  const release = (id) => {
    if (!captured.has(id)) return;
    try { board.releasePointerCapture(id); } catch {}
    captured.delete(id);
  };

  // Anchor the pinch on the map point that is literally between the
  // fingers, and keep it there as they move and scale.
  const beginPinch = () => {
    const { b, ox, oy } = gridOffset();
    const { scale, x, y } = state.view;
    const mid = getMid();
    pinch = {
      dist: Math.max(1, getDist()),
      scale, ox, oy,
      localX: (mid.x - b.left - ox - x) / scale,
      localY: (mid.y - b.top  - oy - y) / scale,
    };
  };

  const updatePinch = () => {
    if (!pinch) return;
    const b = board.getBoundingClientRect();
    const mid = getMid();
    const nextScale = clamp(pinch.scale * (getDist() / pinch.dist), ZOOM_MIN, ZOOM_MAX);
    state.view.scale = nextScale;
    state.view.x = (mid.x - b.left) - pinch.ox - pinch.localX * nextScale;
    state.view.y = (mid.y - b.top)  - pinch.oy - pinch.localY * nextScale;
    applyView();
  };

  board.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    if (event.target.closest?.(PAN_IGNORE_SELECTOR)) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      moved = false;
      dragging = true;
      dragStart = { px: event.clientX, py: event.clientY, vx: state.view.x, vy: state.view.y };
      board.style.cursor = "grabbing";
    } else if (pointers.size === 2) {
      // Second finger down → stop panning, start pinching right here.
      dragging = false;
      dragStart = null;
      for (const id of pointers.keys()) capture(id);
      beginPinch();
    }
  });

  board.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) { moved = true; updatePinch(); return; }

    if (dragging && dragStart) {
      const dx = event.clientX - dragStart.px;
      const dy = event.clientY - dragStart.py;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 3) {
        moved = true;
        capture(event.pointerId);
      }
      if (moved) {
        state.view.x = dragStart.vx + dx;
        state.view.y = dragStart.vy + dy;
        applyView();
      }
    }
  });

  const endPointer = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    release(event.pointerId);

    if (pointers.size === 0) {
      dragging = false;
      dragStart = null;
      pinch = null;
      board.style.cursor = "grab";
    } else if (pointers.size === 1) {
      // Lifted one finger of a pinch → carry on panning with the other.
      const rest = [...pointers.values()][0];
      pinch = null;
      dragging = true;
      moved = true;                       // a pinch must never end as a tap
      dragStart = { px: rest.x, py: rest.y, vx: state.view.x, vy: state.view.y };
    }
  };
  board.addEventListener("pointerup", endPointer);
  board.addEventListener("pointercancel", endPointer);

  const resetPointers = () => {
    for (const id of [...captured]) release(id);
    pointers.clear();
    dragging = false; dragStart = null; pinch = null; moved = false;
    board.style.cursor = "grab";
  };
  window.addEventListener("blur", resetPointers);
  document.addEventListener("visibilitychange", () => { if (document.hidden) resetPointers(); });

  // Swallow the click that follows a pan or a pinch so it never opens a
  // problem by accident.
  board.addEventListener("click", (event) => {
    if (event.target.closest?.(PAN_IGNORE_SELECTOR)) { moved = false; return; }
    if (!moved) return;
    event.stopPropagation();
    event.preventDefault();
    moved = false;
  }, true);

  // ── Zoom buttons (mobile + tablet friendly) ────────────
  const zoomCentre = () => {
    const r = board.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const bindZoomButton = (node, apply) => {
    if (!node) return;
    // Keep the press from starting a pan underneath the button.
    node.addEventListener("pointerdown", (event) => event.stopPropagation());
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      apply();
    });
  };

  bindZoomButton(document.querySelector("#student-zoom-in"), () => {
    const c = zoomCentre();
    zoomAt(c.x, c.y, ZOOM_STEP);
  });
  bindZoomButton(document.querySelector("#student-zoom-out"), () => {
    const c = zoomCentre();
    zoomAt(c.x, c.y, 1 / ZOOM_STEP);
  });
  bindZoomButton(document.querySelector("#student-zoom-reset"), () => {
    state.view = { scale: 1, x: 0, y: 0 };
    applyView();
  });

  window.addEventListener("resize", () => refreshDotFontSizes(), { passive: true });
}