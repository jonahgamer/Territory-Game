// ═══════════════════════════════════════════════════════════════════
// Place type
// ═══════════════════════════════════════════════════════════════════

function onPlaceTypeClick(event) {
  const button = event.target.closest("[data-place-type]");
  if (!button || !typeInfo(button.dataset.placeType)) return;
  placeType = button.dataset.placeType;
  renderPlaceType();
  if (nextNumberInput.checked) problemNoInput.value = nextProblemLabel(placeType);
}

function renderPlaceType() {
  for (const button of placeTypeChoices.querySelectorAll("[data-place-type]")) {
    button.setAttribute("aria-pressed", String(button.dataset.placeType === placeType));
  }
}


