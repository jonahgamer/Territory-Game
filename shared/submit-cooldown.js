const KEY = "territory-submit-cooldown";
const COOLDOWN_MS = 5000;

export function cooldownLeft() {
  try {
    const at = Number(localStorage.getItem(KEY));
    if (!Number.isFinite(at)) return 0;
    return Math.max(0, COOLDOWN_MS - (Date.now() - at));
  } catch {
    return 0;
  }
}

export function cooldownText(ms = cooldownLeft()) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `Wait ${seconds}s before submitting again.`;
}

export function beginSubmitCooldown() {
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* The next attempt still checks whatever was stored. */ }
}

export function releaseSubmitButton(button, label) {
  if (!button) return;
  button.dataset.busy = "";
  const left = cooldownLeft();
  if (left > 0) {
    button.dataset.cooling = "1";
    button.disabled = true;
    button.textContent = `Wait ${Math.ceil(left / 1000)}s`;
    return;
  }
  button.dataset.cooling = "";
  button.disabled = false;
  button.textContent = label;
}

export function bindSubmitCooldown() {
  const tick = () => {
    const left = cooldownLeft();
    for (const button of document.querySelectorAll("[data-submit-cooldown]")) {
      if (button.dataset.busy === "1") continue;
      if (left > 0) {
        button.dataset.cooling = "1";
        button.disabled = true;
        button.textContent = `Wait ${Math.ceil(left / 1000)}s`;
      } else if (button.dataset.cooling === "1") {
        button.dataset.cooling = "";
        button.disabled = false;
        button.textContent = "Submit";
      }
    }
  };
  tick();
  setInterval(tick, 200);
}
