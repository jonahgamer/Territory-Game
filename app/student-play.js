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

  const zoomAt = (cx, cy, factor) => {
    const v = state.view;
    const nextScale = clamp(v.scale * factor, ZOOM_MIN, ZOOM_MAX);
    if (nextScale === v.scale) return;
    const localX = (cx - v.x) / v.scale;
    const localY = (cy - v.y) / v.scale;
    v.x = cx - localX * nextScale;
    v.y = cy - localY * nextScale;
    v.scale = nextScale;
    applyView();
  };

  board.addEventListener("wheel", (event) => {
    if (!event.target.closest("#student-board")) return;
    event.preventDefault();
    const rect = board.getBoundingClientRect();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
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
      const mid = getMid();
      const rect = board.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();                      // NEW
      const gridOffsetX = gridRect.left - rect.left - state.view.x;      // NEW
      const gridOffsetY = gridRect.top  - rect.top  - state.view.y;      // NEW
      pinchStart = {
        dist: getDist(),
        scale: state.view.scale,
        midX: mid.x - rect.left,
        midY: mid.y - rect.top,
        viewX: state.view.x,
        viewY: state.view.y,
        gridOffsetX,                                                     // NEW
        gridOffsetY,                                                     // NEW
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
      const localX = (pinchStart.midX - pinchStart.gridOffsetX - pinchStart.viewX) / pinchStart.scale; // NEW
      const localY = (pinchStart.midY - pinchStart.gridOffsetY - pinchStart.viewY) / pinchStart.scale; // NEW
      const mid = getMid();
      const rect = board.getBoundingClientRect();
      const cx = mid.x - rect.left;
      const cy = mid.y - rect.top;
      state.view.scale = nextScale;
      state.view.x = cx - pinchStart.gridOffsetX - localX * nextScale;   // NEW
      state.view.y = cy - pinchStart.gridOffsetY - localY * nextScale;   // NEW
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

  const zoomInBtn    = document.querySelector("#student-zoom-in");
  const zoomOutBtn   = document.querySelector("#student-zoom-out");
  const zoomResetBtn = document.querySelector("#student-zoom-reset");
  if (zoomInBtn)    zoomInBtn.addEventListener("click", () => zoomAt(board.clientWidth / 2, board.clientHeight / 2, ZOOM_STEP));
  if (zoomOutBtn)   zoomOutBtn.addEventListener("click", () => zoomAt(board.clientWidth / 2, board.clientHeight / 2, 1 / ZOOM_STEP));
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => {
    state.view = { scale: 1, x: 0, y: 0 };
    state.applyView();
  });

  window.addEventListener("resize", () => refreshDotFontSizes(), { passive: true });
}