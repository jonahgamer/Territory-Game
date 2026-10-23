// ──────────────────────────────────────────────────────────
// PAN + ZOOM
// ──────────────────────────────────────────────────────────
function installPanZoom() {
  const board = document.querySelector("#student-board");
  const grid  = document.querySelector("#student-maps");
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

  // Convert a client-space point to grid-local (untransformed) coordinates.
  // Also returns the client-space position of the grid's untransformed
  // origin, so we can re-anchor after a scale change.
  const clientToLocal = (clientX, clientY) => {
    const rect = grid.getBoundingClientRect();     // ← grid, not board
    const s = state.view.scale;
    return {
      x: (clientX - rect.left) / s,
      y: (clientY - rect.top) / s,
      originX: rect.left - state.view.x,
      originY: rect.top - state.view.y,
    };
  };

  const zoomAtClient = (clientX, clientY, factor) => {
    const v = state.view;
    const nextScale = clamp(v.scale * factor, ZOOM_MIN, ZOOM_MAX);
    if (nextScale === v.scale) return;
    const { x: localX, y: localY, originX, originY } = clientToLocal(clientX, clientY);
    v.scale = nextScale;
    v.x = clientX - originX - localX * nextScale;
    v.y = clientY - originY - localY * nextScale;
    applyView();
  };

  const zoomAtVisibleCenter = (factor) => {
    const rect = board.getBoundingClientRect();
    const left   = Math.max(rect.left, 0);
    const right  = Math.min(rect.right, window.innerWidth);
    const top    = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    const cx = right > left ? (left + right) / 2 : rect.left + rect.width / 2;
    const cy = bottom > top ? (top + bottom) / 2 : rect.top + rect.height / 2;
    zoomAtClient(cx, cy, factor);
  };

  board.addEventListener("wheel", (event) => {
    if (!event.target.closest("#student-board")) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomAtClient(event.clientX, event.clientY, factor);  // ← pass client coords
  }, { passive: false });

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
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
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
      const mid = getMid();
      const { x: localX, y: localY } = clientToLocal(mid.x, mid.y);
      pinchStart = {
        dist: getDist(),
        scale: state.view.scale,
        localX,
        localY,
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
      const rawFactor = getDist() / pinchStart.dist;
      // Soften so small finger movement doesn't cause a large zoom jump.
      const factor = Math.pow(rawFactor, PINCH_DAMP);
      const nextScale = clamp(pinchStart.scale * factor, ZOOM_MIN, ZOOM_MAX);
      const mid = getMid();

      // Recompute the grid's untransformed origin from the CURRENT
      // transformed rect — robust against page scroll / layout shift.
      const rect = grid.getBoundingClientRect();
      const originX = rect.left - state.view.x;
      const originY = rect.top - state.view.y;

      state.view.scale = nextScale;
      // Keep the local point that was under the initial midpoint
      // pinned under the (current) midpoint → pinch at the right spot.
      state.view.x = mid.x - originX - pinchStart.localX * nextScale;
      state.view.y = mid.y - originY - pinchStart.localY * nextScale;
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

  // Existing in-page zoom controls (if any) — now centre on the visible board.
  const zoomInBtn    = document.querySelector("#student-zoom-in");
  const zoomOutBtn   = document.querySelector("#student-zoom-out");
  const zoomResetBtn = document.querySelector("#student-zoom-reset");
  if (zoomInBtn)    zoomInBtn.addEventListener("click", () => zoomAtVisibleCenter(ZOOM_STEP));
  if (zoomOutBtn)   zoomOutBtn.addEventListener("click", () => zoomAtVisibleCenter(1 / ZOOM_STEP));
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => {
    state.view = { scale: 1, x: 0, y: 0 };
    state.applyView();
  });

  // ── Inject zoom buttons next to the "go to top" buttons ──
  bindZoomControlsNearTop(zoomAtVisibleCenter);

  window.addEventListener("resize", () => refreshDotFontSizes(), { passive: true });
}

// New helper: puts +/− buttons beside #back-to-top (mobile) and
// #back-to-top-desktop (desktop). Handles both being in the same bar
// without duplicating.
function bindZoomControlsNearTop(zoomAtCenter) {
  const anchors = [
    document.querySelector("#back-to-top"),
    document.querySelector("#back-to-top-desktop"),
  ].filter(Boolean);
  const bars = [...new Set(anchors.map((a) => a.parentNode).filter(Boolean))];
  if (!bars.length) return;

  const mkBtn = (label, aria) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("aria-label", aria);
    btn.title = aria;
    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
      minWidth: "36px",
      flex: "0 0 auto",
      padding: "0",
      margin: "0 6px",
      borderRadius: "6px",
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(255,255,255,0.08)",
      color: "inherit",
      fontSize: "18px",
      fontWeight: "700",
      lineHeight: "1",
      cursor: "pointer",
      userSelect: "none",
    });
    return btn;
  };

  for (const bar of bars) {
    const anchor  = anchors.find((a) => a.parentNode === bar);
    const zoomIn  = mkBtn("+", "Zoom in");
    const zoomOut = mkBtn("−", "Zoom out");
    zoomIn.addEventListener("click",  () => zoomAtCenter(ZOOM_STEP));
    zoomOut.addEventListener("click", () => zoomAtCenter(1 / ZOOM_STEP));
    if (anchor) {
      bar.insertBefore(zoomOut, anchor);
      bar.insertBefore(zoomIn, zoomOut);
    } else {
      bar.append(zoomIn, zoomOut);
    }
  }
}