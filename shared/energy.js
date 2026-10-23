export const ENERGY_MAX = 100;

export const ENERGY_DEFAULTS = {
  energyRegen: 5,
  energyRegenSeconds: 30,
  energyAttemptCost: 10,
  energyAttemptMin: 10,
  energySolveBelow: 50,
  energySolve: { easy: 8, normal: 12, hard: 18, insane: 25 },
};

export function clampEnergy(value, fallback, max = ENERGY_MAX) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) return fallback;
  return n;
}

export function readEnergySettings(raw) {
  const solve = raw?.energySolve || {};
  return {
    regen: clampEnergy(raw?.energyRegen, ENERGY_DEFAULTS.energyRegen),
    regenSeconds: clampEnergy(raw?.energyRegenSeconds, ENERGY_DEFAULTS.energyRegenSeconds, 86400),
    attemptCost: clampEnergy(raw?.energyAttemptCost, ENERGY_DEFAULTS.energyAttemptCost),
    attemptMin: clampEnergy(raw?.energyAttemptMin, ENERGY_DEFAULTS.energyAttemptMin),
    solveBelow: clampEnergy(raw?.energySolveBelow, ENERGY_DEFAULTS.energySolveBelow),
    solve: {
      easy: clampEnergy(solve.easy, ENERGY_DEFAULTS.energySolve.easy),
      normal: clampEnergy(solve.normal, ENERGY_DEFAULTS.energySolve.normal),
      hard: clampEnergy(solve.hard, ENERGY_DEFAULTS.energySolve.hard),
      insane: clampEnergy(solve.insane, ENERGY_DEFAULTS.energySolve.insane),
    },
  };
}

export function mergeEnergyLedger(current, incoming) {
  const next = cleanEnergyLedger(current);
  for (const entry of cleanEnergyLedger(incoming)) {
    const index = next.findIndex((item) => item.teamId === entry.teamId);
    if (index >= 0) next[index] = entry;
    else next.push(entry);
  }
  return next;
}

export function cleanEnergyLedger(value) {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const item of value) {
    if (!item || typeof item.teamId !== "string" || !item.teamId) continue;
    if (!Number.isInteger(item.value) || item.value < 0 || item.value > ENERGY_MAX) continue;
    if (!Number.isInteger(item.at) || item.at < 0) continue;
    if (items.some((entry) => entry.teamId === item.teamId)) continue;
    items.push({ teamId: item.teamId, value: item.value, at: item.at });
  }
  return items;
}

export function energyState({ settings, liveAt, endAt, now, stored }) {
  if (!Number.isInteger(liveAt) || now < liveAt) return { value: ENERGY_MAX, at: Number.isInteger(liveAt) ? liveAt : 0 };
  const base = stored && Number.isInteger(stored.value)
    ? Math.min(ENERGY_MAX, Math.max(0, stored.value))
    : ENERGY_MAX;
  const at = stored && Number.isInteger(stored.at) ? stored.at : liveAt;
  const until = Math.min(now, Number.isInteger(endAt) ? endAt : now);
  const from = Math.max(at, liveAt);
  if (until <= from || !settings || settings.regen <= 0 || settings.regenSeconds < 1) {
    return { value: base, at: from };
  }
  const interval = settings.regenSeconds * 1000;
  const ticks = Math.floor((until - from) / interval);
  return {
    value: Math.min(ENERGY_MAX, base + ticks * settings.regen),
    at: from + ticks * interval,
  };
}

export function energyNow(args) {
  return energyState(args).value;
}

export function energyAfterAttempt(current, settings, difficulty, correct) {
  let next = Math.max(0, current - settings.attemptCost);
  if (correct && current < settings.solveBelow) {
    const gain = settings.solve[difficulty] || 0;
    next = Math.min(ENERGY_MAX, next + gain);
  }
  return next;
}
