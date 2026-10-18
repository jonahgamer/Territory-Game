// ═══════════════════════════════════════════════════════════════════
// Map CRUD
// ═══════════════════════════════════════════════════════════════════

function confirmTwice(first, second) {
  return window.confirm(first) && window.confirm(second);
}

function deleteOpenMap() {
  const map = currentMap();
  if (!map) return;
  const name = map.name || "this map";
  if (!confirmTwice(`Delete the map ${name}?`, `Delete ${name} now? The map and every cell on it will be removed.`)) return;
  maps = maps.filter((item) => item.id !== openMapId);
  mapDirty = false;
  mapSnapshot = null;
  updateMapSaveButton();
  persistMaps();
  if (ROUTED) navigateTo("maps", { replace: true });
  else showMaps();
}

function createMap(event) {
  event.preventDefault();
  const name = readMapName(mapNameInput.value);
  const cols = readSize(colsInput.value);
  const rows = readSize(rowsInput.value);

  if (!name) {
    formError.hidden = false;
    formError.textContent = "Give the map a name.";
    return;
  }
  if (cols === null || rows === null) {
    formError.hidden = false;
    formError.textContent = `Width and height must be whole numbers from ${MIN_SIZE} to ${MAX_SIZE}.`;
    return;
  }

  formError.hidden = true;
  maps.unshift({
    id: crypto.randomUUID(),
    name,
    cols,
    rows,
    cells: emptyCells(cols * rows),
  });
  persistMaps();
  mapNameInput.value = "";
  renderMaps();
}

function commitMapName() {
  const map = currentMap();
  if (!map) return;
  const name = readMapName(editorNameInput.value);
  if (!name) return;
  map.name = name;
  editorTitle.textContent = name;
  deleteOpenMapButton.setAttribute("aria-label", `Delete map ${name}`);
  markMapDirty();
}

function onMapListClick(event) {
  const openButton = event.target.closest("[data-open-id]");
  if (!openButton) return;
  if (ROUTED) navigateTo(["maps", openButton.dataset.openId]);
  else showEditor(openButton.dataset.openId);
}


