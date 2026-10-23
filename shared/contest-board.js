export function contestMapIds(contest) {
  const ids = [];
  const listed = Array.isArray(contest?.mapIds) ? contest.mapIds : [];
  for (const id of listed) {
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length && typeof contest?.mapId === "string" && contest.mapId) ids.push(contest.mapId);
  return ids;
}

export function primaryMapId(contest) {
  return contestMapIds(contest)[0] || "";
}

export function placeKey(mapId, cell) {
  return `${mapId}:${cell}`;
}

export function samePlace(a, b) {
  return Boolean(a && b && a.mapId === b.mapId && a.cell === b.cell);
}

export function placeMapId(item, contest) {
  if (typeof item?.mapId === "string" && item.mapId) return item.mapId;
  return primaryMapId(contest);
}

export function cleanTeleports(value, mapIds) {
  const allowed = new Set(mapIds);
  const pairs = [];
  const used = new Set();
  if (!Array.isArray(value)) return pairs;
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const a = cleanEnd(raw.a, allowed);
    const b = cleanEnd(raw.b, allowed);
    if (!a || !b || placeKey(a.mapId, a.cell) === placeKey(b.mapId, b.cell)) continue;
    const ka = placeKey(a.mapId, a.cell);
    const kb = placeKey(b.mapId, b.cell);
    if (used.has(ka) || used.has(kb)) continue;
    used.add(ka);
    used.add(kb);
    const label = cleanLabel(raw.label) || String(pairs.length + 1);
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 40) : `tp-${pairs.length + 1}`;
    pairs.push({ id, label, a, b });
  }
  return pairs;
}

function cleanEnd(end, allowed) {
  if (!end || typeof end.mapId !== "string" || !allowed.has(end.mapId)) return null;
  if (!Number.isInteger(end.cell) || end.cell < 0) return null;
  return { mapId: end.mapId, cell: end.cell };
}

function cleanLabel(value) {
  const label = String(value || "").trim().slice(0, 4);
  return label || "";
}

export function nextTeleportLabel(pairs) {
  const used = new Set((pairs || []).map((pair) => pair.label));
  for (let n = 1; n < 1000; n += 1) {
    if (!used.has(String(n))) return String(n);
  }
  return String((pairs || []).length + 1);
}

export function teleportPairAt(contest, mapId, cell) {
  return (contest?.teleports || []).find((pair) => (
    (pair.a.mapId === mapId && pair.a.cell === cell) || (pair.b.mapId === mapId && pair.b.cell === cell)
  )) || null;
}

export function teleportOtherEnd(pair, mapId, cell) {
  if (!pair) return null;
  if (pair.a.mapId === mapId && pair.a.cell === cell) return pair.b;
  if (pair.b.mapId === mapId && pair.b.cell === cell) return pair.a;
  return null;
}

export function teleportLabel(contest, mapId, cell) {
  return teleportPairAt(contest, mapId, cell)?.label || "";
}
