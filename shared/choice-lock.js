export const CHOICE_LOCK_MS = 3 * 60 * 1000;

export function answerIsChoice(answer) {
  return /^[ABCD]$/i.test(String(answer ?? "").trim());
}

export function detectedMultipleChoice(problem) {
  const parts = Array.isArray(problem?.parts) ? problem.parts : [];
  const answers = parts.length ? parts.map((part) => part?.answer) : [problem?.answer];
  const filled = answers.filter((answer) => String(answer ?? "").trim());
  return filled.length > 0 && filled.every(answerIsChoice);
}

export function problemIsMultipleChoice(problem) {
  if (!problem) return false;
  if (problem.multipleChoice === true) return true;
  if (problem.multipleChoice === false) return false;
  return detectedMultipleChoice(problem);
}

export function activeChoiceLock(locks, teamId, mapId, cell, now) {
  if (!teamId) return null;
  const lock = (locks || []).find((item) => (
    item?.teamId === teamId
    && item.cell === cell
    && (!mapId || !item.mapId || item.mapId === mapId)
    && Number(item.until) > now
  ));
  return lock || null;
}

export function lockRemainingLabel(until, now) {
  const seconds = Math.max(0, Math.ceil((Number(until) - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function paintChoiceLockControl({ form, note, lock, now, warnBefore }) {
  if (note) {
    if (lock) {
      note.hidden = false;
      note.textContent = `Wrong answer. You can try again in ${lockRemainingLabel(lock.until, now)}. You can still read the problem.`;
    } else if (warnBefore) {
      note.hidden = false;
      note.textContent = "A wrong answer locks this problem for 3 minutes.";
    } else {
      note.hidden = true;
    }
  }
  if (!form) return Boolean(lock);
  const submit = form.querySelector("button");
  const inputs = [...form.querySelectorAll("input, textarea")];
  if (lock) {
    for (const input of inputs) {
      if (input.disabled && input.dataset.choiceLocked !== "1") continue;
      input.disabled = true;
      input.dataset.choiceLocked = "1";
    }
    if (submit && submit.dataset.busy !== "1") submit.disabled = true;
    return true;
  }
  for (const input of inputs) {
    if (input.dataset.choiceLocked === "1") {
      input.disabled = false;
      delete input.dataset.choiceLocked;
    }
  }
  return false;
}
