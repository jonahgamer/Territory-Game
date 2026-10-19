// ═══════════════════════════════════════════════════════════════════
// Painting
// ═══════════════════════════════════════════════════════════════════

function chooseTool(kind) {
  paintKind = kind;
  kindProblem?.setAttribute("aria-pressed", String(kind === "problem"));
  kindSpawnpoint?.setAttribute("aria-pressed", String(kind === "spawnpoint"));
  kindObstacle?.setAttribute("aria-pressed", String(kind === "obstacle"));
  kindEmpty?.setAttribute("aria-pressed", String(kind === "empty"));
  if (problemOptions) problemOptions.hidden = kind !== "problem";
}

function fingerMap() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function startPaint(event) {
  const index = cellIndexFromTarget(event.target);
  if (index === null) return;
  if (fingerMap() && event.pointerType === "touch") {
    armTouchPaint(event, index);
    return;
  }

  event.preventDefault();
  painting = true;
  strokeCount = 0;
  pendingProblemOpen = null;
  paintedThisStroke = new Set();
  window?.addEventListener("pointermove", continuePaint);
  window?.addEventListener("pointerup", stopPaint);
  window?.addEventListener("pointercancel", stopPaint);
  applyTool(index, "toggle");
}

function continuePaint(event) {
  if (!painting) return;
  const index = cellIndexFromPoint(event.clientX, event.clientY);
  if (index === null) return;
  applyTool(index, "toggle");
}

let touchPaint = null;

function armTouchPaint(event, index) {
  touchPaint = { x: event.clientX, y: event.clientY, index, pointerId: event.pointerId, moved: false };
  window?.addEventListener("pointermove", moveTouchPaint);
  window?.addEventListener("pointerup", finishTouchPaint);
  window?.addEventListener("pointercancel", cancelTouchPaint);
}

function moveTouchPaint(event) {
  if (!touchPaint || event.pointerId !== touchPaint.pointerId) return;
  if (Math.hypot(event.clientX - touchPaint.x, event.clientY - touchPaint.y) > 10) touchPaint.moved = true;
}

function finishTouchPaint(event) {
  if (!touchPaint || (event && event.pointerId !== touchPaint.pointerId)) return;
  const tap = touchPaint;
  cancelTouchPaint();
  if (!tap.moved) applyTool(tap.index, "toggle");
}

function cancelTouchPaint() {
  touchPaint = null;
  window.removeEventListener("pointermove", moveTouchPaint);
  window.removeEventListener("pointerup", finishTouchPaint);
  window.removeEventListener("pointercancel", cancelTouchPaint);
}

function stopPaint() {
  cancelTouchPaint();
  if (!painting) return;
  const openNo = strokeCount === 1 ? pendingProblemOpen : null;
  painting = false;
  strokeCount = 0;
  pendingProblemOpen = null;
  paintedThisStroke = new Set();
  window.removeEventListener("pointermove", continuePaint);
  window.removeEventListener("pointerup", stopPaint);
  window.removeEventListener("pointercancel", stopPaint);
  if (openNo && openMapId) {
    const type = openNo.type;
    const index = String(openNo.index);
    const mapId = openMapId;
    const openProblem = () => navigateTo(["maps", mapId, "problem", type, index]);
    if (mapDirty) {
      saveOpenMap().then(() => {
        if (!mapDirty) openProblem();
      });
    } else {
      openProblem();
    }
  }
}

function applyTool(index, mode) {
  if (paintedThisStroke.has(index)) return;

  const map = currentMap();
  if (!map) return;

  const cell = map.cells[index];
  if (paintKind === "problem" && cell.kind === "problem") {
    paintedThisStroke.add(index);
    strokeCount += 1;
    pendingProblemOpen = { index: cell.problemNo, type: cell.type };
    return;
  }

  if (mode === "toggle" && cell.kind !== "empty") {
    paintedThisStroke.add(index);
    strokeCount += 1;
    map.cells[index] = { kind: "empty" };
    paintCell(map, index);
    markMapDirty();
    return;
  }

  if (paintKind === "problem") {
    const picked = placeMode === "pick" ? pickProblemForMap(map) : null;
    const problemNo = placeMode === "pick" ? picked?.index : readProblemNo(problemNoInput.value);
    const type = placeMode === "pick" ? picked?.type : placeType;
    if (placeMode === "pick" && picked?.error) {
      problemNoError.hidden = false;
      problemNoError.textContent = picked.error;
      stopPaint();
      return;
    }
    if (problemNo === null || !type) {
      problemNoError.hidden = false;
      problemNoError.textContent = `Problem no. must be a whole number from ${MIN_PROBLEM_NO} to ${MAX_PROBLEM_NO}.`;
      stopPaint();
      return;
    }

    problemNoError.hidden = true;
    paintedThisStroke.add(index);
    strokeCount += 1;
    map.cells[index] = { kind: "problem", problemNo, type };
    paintCell(map, index);
    markMapDirty();
    if (placeMode !== "pick" && nextNumberInput.checked && problemNo < MAX_PROBLEM_NO) {
      problemNoInput.value = String(problemNo + 1);
    }
    return;
  }

  paintedThisStroke.add(index);
  strokeCount += 1;
  if (paintKind === "spawnpoint") map.cells[index] = { kind: "spawnpoint" };
  else if (paintKind === "obstacle") map.cells[index] = { kind: "obstacle" };
  else map.cells[index] = { kind: "empty" };
  paintCell(map, index);
  markMapDirty();
}

function paintCell(map, index) {
  const button = editorGrid.querySelector(`[data-index="${index}"]`);
  if (!button) return;

  const cell = map.cells[index];
  const row = Math.floor(index / map.cols) + 1;
  const column = (index % map.cols) + 1;
  button.className = cellClassName(cell, "grid-cell");
  button.textContent = cellText(cell);
  button.setAttribute("aria-label", cellLabel(cell, row, column));
  renderMapCounts(map);
}

function cellIndexFromTarget(target) {
  const cell = target.closest?.("[data-index]");
  if (!cell || !editorGrid.contains(cell)) return null;
  return Number(cell.dataset.index);
}

function cellIndexFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  return cellIndexFromTarget(element);
}


