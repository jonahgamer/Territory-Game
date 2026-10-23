// ──────────────────────────────────────────────────────────
// PAN + ZOOM
// ──────────────────────────────────────────────────────────
function installPanZoom() {
  const board = document.querySelector("#student-board");
  const grid  = document.querySelector("#student-grid");
  if (!board || !grid) return;

  board.style.position = "relative";
  board.style.overflow = "hidden";
  board.style.touchAction = "none";
  board.style.cursor = "grab";

  grid.style.transformOrigin = "0 0";
  grid.style.willChange = "transform";
  grid.style.userSelect = "none";

  const applyView = () => {
    const { scale, x, y } = state.view;
    grid.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    refreshDotFontSizes();
  };
  state.applyView = applyView;

  // The grid's *untransformed* origin in client coordinates.
  //
  // gridRect.left is the visual (post-transform) left edge, which equals
  //   naturalLeft + view.x
  // so stripping view.x gives the stable natural position — regardless of
  // how the grid is centered/offset inside the board, or how it's zoomed.
  const gridBase = () => {
    const r = grid.getBoundingClientRect();
    return { left: r.left - state.view.x, top: r.top - state.view.y };
  };

  // Zoom toward a client-coordinate point.
  const zoomAt = (clientX, clientY, factor) => {
    const v = state.view;
    const nextScale = clamp(v.scale * factor, ZOOM_MIN, ZOOM_MAX);
    if (nextScale === v.scale) return;

    const base = gridBase();
    const localX = (clientX - base.left - v.x) / v.scale;
    const localY = (clientY - base.top  - v.y) / v.scale;

    v.scale = nextScale;
    v.x = clientX - base.left - localX * nextScale;
    v.y = clientY - base.top  - localY * nextScale;
    applyView();
  };

  // ── Wheel zoom (desktop / trackpad) ──
  board.addEventListener("wheel", (event) => {
    if (!event.target.closest("#student-board")) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false });

  // ── Pointer handling: 1 finger = pan, 2 fingers = pinch (zoom + pan) ──
  const pointers = new Map();
  let pinchStart = null;
  let dragging = false;
  let dragStart = null;
  let moved = false;
  let dragCapturedId = null;

  const getMid = () => {
    const pts = [...pointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  };
  const getDist = () => {
    const pts = [...pointers.values()];
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  };

  board.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = false;

    if (pointers.size === 1) {
      dragging = true;
      dragStart = { px: event.clientX, py: event.clientY, vx: state.view.x, vy: state.view.y };
      board.style.cursor = "grabbing";
    } else if (pointers.size === 2) {
      dragging = false;
      for (const id of pointers.keys()) {
        try { board.setPointerCapture(id); dragCapturedId = id; } catch {}
      }
      // Capture the pinch relative to the *current* grid position. This is
      // the key fix: we no longer assume the grid sits at (0,0) in the board.
      const base = gridBase();
      const mid = getMid();
      const scale = state.view.scale;
      pinchStart = {
        dist: Math.max(1, getDist()),          // guard against div-by-zero
        scale,
        localX: (mid.x - base.left - state.view.x) / scale,
        localY: (mid.y - base.top  - state.view.y) / scale,
        baseLeft: base.left,
        baseTop: base.top,
      };
    }
  });

  board.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1 && dragging && dragStart) {
      const dx = event.clientX - dragStart.px;
      const dy = event.clientY - dragStart.py;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 3) {
        moved = true;
        try { board.setPointerCapture(event.pointerId); dragCapturedId = event.pointerId; } catch {}
      }
      if (moved) {
        state.view.x = dragStart.vx + dx;
        state.view.y = dragStart.vy + dy;
        applyView();
      }
    } else if (pointers.size === 2 && pinchStart) {
      moved = true;
      const dist = getDist();
      const factor = dist / pinchStart.dist;
      const nextScale = clamp(pinchStart.scale * factor, ZOOM_MIN, ZOOM_MAX);
      const mid = getMid();
      // Recompute base each frame so page scroll / layout shifts don't drift.
      const base = gridBase();
      state.view.scale = nextScale;
      state.view.x = mid.x - base.left - pinchStart.localX * nextScale;
      state.view.y = mid.y - base.top  - pinchStart.localY * nextScale;
      applyView();
    }
  });

  const endPointer = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (dragCapturedId === event.pointerId) {
      try { board.releasePointerCapture(event.pointerId); } catch {}
      dragCapturedId = null;
    }
    if (pointers.size === 0) {
      dragging = false; dragStart = null; pinchStart = null;
      board.style.cursor = "grab";
    } else if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      dragging = true;
      dragStart = { px: remaining.x, py: remaining.y, vx: state.view.x, vy: state.view.y };
      pinchStart = null;
    }
  };
  board.addEventListener("pointerup", endPointer);
  board.addEventListener("pointercancel", endPointer);
  board.addEventListener("pointerleave", endPointer);

  board.addEventListener("click", (event) => {
    if (moved) {
      event.stopPropagation();
      event.preventDefault();
      moved = false;
    }
  }, true);

  // ── Zoom buttons (also work on mobile) ──
  const zoomInBtn    = document.querySelector("#student-zoom-in");
  const zoomOutBtn   = document.querySelector("#student-zoom-out");
  const zoomResetBtn = document.querySelector("#student-zoom-reset");

  const zoomAtBoardCenter = (factor) => {
    const rect = board.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  if (zoomInBtn)    zoomInBtn.addEventListener("click", () => zoomAtBoardCenter(ZOOM_STEP));
  if (zoomOutBtn)   zoomOutBtn.addEventListener("click", () => zoomAtBoardCenter(1 / ZOOM_STEP));
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => {
    state.view = { scale: 1, x: 0, y: 0 };
    state.applyView();
  });

  window.addEventListener("resize", () => refreshDotFontSizes(), { passive: true });
}