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

function mapMode(map) {
  return map?.mode === "testing" ? "testing" : "official";
}

function onCreateMapModeClick(event) {
  const button = event.target.closest("[data-map-mode]");
  if (!button) return;
  newMapMode = button.dataset.mapMode === "testing" ? "testing" : "official";
  renderMapModeButtons(createMapMode, newMapMode);
}

function onMapModeClick(event) {
  const button = event.target.closest("[data-map-mode]");
  const map = currentMap();
  if (!button || !map) return;
  const mode = button.dataset.mapMode === "testing" ? "testing" : "official";
  if (mapMode(map) === mode) return;
  map.mode = mode;
  renderMapModeButtons(mapModeChoices, mode);
  markMapDirty();
  renderMaps();
}

function renderMapModeButtons(container, mode) {
  if (!container) return;
  for (const button of container.querySelectorAll("[data-map-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mapMode === mode));
  }
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
    mode: newMapMode,
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
  const mapId = openButton.dataset.openId;
  if (!maps.some((map) => map.id === mapId)) return;
  try {
    showEditor(mapId);
    if (ROUTED) setHashSilently(["maps", mapId]);
  } catch (error) {
    console.error("[map]", error);
    showPageToast(error?.message || "Could not open this map.", "warn");
  }
}


