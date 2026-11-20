// Hidden rules live only in this file.
// Add one object per rule. The website cannot create rules.
// id stays the same forever. title is the short name admins see.
// text is what contestants read after the rule is revealed.
//
// { id: "short-name", title: "Short name", text: "The rule, in plain words." }

export const HIDDEN_RULES = [
  {
    id: "same-type-run",
    title: "Three of the same type",
    text: "If a team solves three problems of the same type in a row, that team gains 1 extra point. The count returns to zero when the extra point is gained, and also when the team solves a problem of another type.",
  },
  {
    id: "spawn-guard",
    title: "Cells beside a spawn point",
    text: "The four cells directly beside a spawn point can be attempted only by the team on that spawn point. Those cells are the ones above, below, left, and right.",
  },
  {
    id: "map-multiplier",
    title: "Map multiplier",
    text: "Problems on one map in this contest are worth a chosen multiple of their marks. The map and the multiple are set on the contest. The multiple is from 0.1 to 10.",
  },
  {
    id: "cell-steal",
    title: "Steal a fresh solve",
    text: "If one team solves a problem and another team solves that same problem within the chosen number of seconds, the second team takes the cell. The first team loses that cell and the marks scored on it.",
  },
  {
    id: "touch-bonus",
    title: "Touching territories",
    text: "When the contest ends, each team gains 1 mark for every other team whose territory touches theirs. Those marks are added at the end.",
  },
  {
    id: "territory-rectangle",
    title: "Largest rectangle",
    text: "When the contest ends, each team gains marks equal to the area of the largest rectangle that fits inside its territory, divided by 2 and rounded down. The rectangle may cover part or all of that territory. These marks are added only at the end.",
  },
  {
    id: "solve-burst",
    title: "Fast solves",
    text: "If a team solves a chosen number of problems, and each solve is less than a chosen number of seconds after the one before it, that team gains a chosen number of extra points at once. The count then returns to zero. The three numbers are set on the contest.",
  },
];

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_RULES = 40;
const MAX_MINUTES = 10080;

export function hiddenRuleCatalog() {
  const rules = [];
  const seen = new Set();
  for (const rule of HIDDEN_RULES) {
    const id = typeof rule?.id === "string" ? rule.id.trim() : "";
    const title = typeof rule?.title === "string" ? rule.title.trim() : "";
    const text = typeof rule?.text === "string" ? rule.text.trim() : "";
    if (!ID_RE.test(id) || !title || title.length > 80 || !text || text.length > 4000) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    rules.push({ id, title, text });
  }
  return rules;
}

export function hiddenRuleEnabled(contest, id) {
  return cleanHiddenRuleSettings(contest?.hiddenRules).items.some((item) => item.id === id);
}

export function hiddenRuleDenial(action) {
  return `A hidden rule stops your team from ${action}.`;
}

function largestRectangleArea(heights) {
  const stack = [-1];
  let best = 0;
  const bars = heights.concat([0]);
  for (let index = 0; index < bars.length; index += 1) {
    while (stack.length > 1 && bars[stack[stack.length - 1]] > bars[index]) {
      const height = bars[stack.pop()];
      const width = index - stack[stack.length - 1] - 1;
      best = Math.max(best, height * width);
    }
    stack.push(index);
  }
  return best;
}

export function largestRectangleInTerritory(grids) {
  let best = 0;
  for (const grid of grids) {
    if (!grid?.length || !grid[0]?.length) continue;
    const heights = Array(grid[0].length).fill(0);
    for (const row of grid) {
      for (let column = 0; column < heights.length; column += 1) {
        heights[column] = row[column] ? heights[column] + 1 : 0;
      }
      best = Math.max(best, largestRectangleArea(heights));
    }
  }
  return { area: best, bonus: Math.floor(best / 2) };
}

export function solveBurstBonus(times, count, seconds, points) {
  let streak = 0;
  let last = null;
  let award = 0;
  const gap = seconds * 1000;
  for (const time of times) {
    if (last !== null && time - last >= gap) streak = 0;
    streak += 1;
    last = time;
    if (streak === count) {
      award = points;
      streak = 0;
      last = null;
    } else award = 0;
  }
  return award;
}

export function sameTypeRunBonus(types) {
  let streak = 0;
  let last = "";
  let bonus = 0;
  for (const type of types) {
    if (typeof type !== "string" || !type) continue;
    if (type === last) streak += 1;
    else { last = type; streak = 1; }
    if (streak === 3) {
      bonus = 1;
      streak = 0;
      last = "";
    } else bonus = 0;
  }
  return bonus;
}

export function roundMark(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

export function cleanBurstSettings(raw) {
  const count = Number(raw?.count);
  const seconds = Number(raw?.seconds);
  const points = roundMark(raw?.points);
  return {
    count: Number.isInteger(count) && count >= 2 && count <= 30 ? count : 3,
    seconds: Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : 60,
    points: points >= 0.1 && points <= 100 ? points : 1,
  };
}

export function pointPhrase(points) {
  const n = roundMark(points);
  const shown = Number.isInteger(Math.abs(n)) ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
  return `${shown} point${Math.abs(n) === 1 ? "" : "s"}`;
}

export function hiddenRuleEffectMessage(contest, ruleId, now, { points = null, action = "" } = {}) {
  const revealed = revealedHiddenRules(contest, now).some((rule) => rule.id === ruleId);
  const title = hiddenRuleCatalog().find((rule) => rule.id === ruleId)?.title || "a hidden rule";
  const amount = points !== null && Number.isFinite(Number(points)) ? roundMark(points) : 0;
  if (action === "attempting this problem") {
    return revealed
      ? `${title}: only the team on that spawn can attempt this cell.`
      : "A hidden rule stops your team from attempting this problem.";
  }
  if (action === "cell") {
    return revealed ? `You got this cell from ${title}.` : "A hidden rule gave this cell to your team.";
  }
  if (action === "lost-cell") {
    const lost = amount ? pointPhrase(Math.abs(amount)) : "";
    if (!revealed) return lost ? `A hidden rule took a cell from your team and removed ${lost}.` : "A hidden rule took a cell from your team.";
    return lost ? `${title} took a cell from your team and removed ${lost}.` : `You lost a cell from ${title}.`;
  }
  if (amount) {
    const phrase = pointPhrase(Math.abs(amount));
    if (!revealed) return amount < 0 ? `A hidden rule took ${phrase} from your team.` : `A hidden rule gave your team ${phrase}.`;
    return amount < 0 ? `You lost ${phrase} from ${title}.` : `You got ${phrase} from ${title}.`;
  }
  if (action) {
    return revealed
      ? `${title} stops your team from ${action}.`
      : `A hidden rule stops your team from ${action}.`;
  }
  return "";
}

export function cleanMultiplier(value) {
  const n = roundMark(value);
  if (n < 0.1 || n > 10) return null;
  return n;
}

export function cleanHiddenRuleSettings(value, mapIds = null) {
  const known = new Set(hiddenRuleCatalog().map((rule) => rule.id));
  const allowedMaps = Array.isArray(mapIds) ? new Set(mapIds.filter((id) => typeof id === "string" && id)) : null;
  const reveal = value?.reveal === "periodic" ? "periodic" : "minutes";
  const order = value?.order === "random" ? "random" : "designated";
  const period = Number(value?.periodMinutes);
  const periodMinutes = Number.isInteger(period) && period >= 1 && period <= MAX_MINUTES ? period : 10;
  const items = [];
  const seen = new Set();
  for (const raw of Array.isArray(value?.items) ? value.items : []) {
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    const minute = raw?.revealMinute === null || raw?.revealMinute === "" ? null : Number(raw?.revealMinute);
    const revealMinute = Number.isInteger(minute) && minute >= 0 && minute <= MAX_MINUTES ? minute : null;
    const item = { id, revealMinute, hidden: raw?.hidden === true };
    if (id === "map-multiplier") {
      const mapId = typeof raw?.mapId === "string" ? raw.mapId : "";
      const multiplier = cleanMultiplier(raw?.multiplier);
      item.mapId = allowedMaps && !allowedMaps.has(mapId) ? "" : mapId;
      item.multiplier = multiplier === null ? 1 : multiplier;
    }
    if (id === "cell-steal") {
      const seconds = Number(raw?.seconds);
      item.seconds = Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : 45;
    }
    if (id === "solve-burst") Object.assign(item, cleanBurstSettings(raw));
    items.push(item);
    if (items.length >= MAX_RULES) break;
  }
  return { reveal, order, periodMinutes, items };
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle(items, seedText) {
  const list = items.slice();
  let seed = hashSeed(seedText);
  for (let i = list.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}

export function revealedHiddenRules(contest, now = Date.now()) {
  const settings = cleanHiddenRuleSettings(contest?.hiddenRules);
  const catalog = new Map(hiddenRuleCatalog().map((rule) => [rule.id, rule]));
  const start = contest?.startAt;
  if (!Number.isInteger(start) || now < start) return [];
  const elapsed = Math.floor((now - start) / 60000);
  const chosen = settings.items
    .map((item) => ({ ...item, rule: catalog.get(item.id) }))
    .filter((item) => item.rule);
  let visible = [];
  if (settings.reveal === "periodic") {
    const queue = chosen.filter((item) => item.hidden !== true);
    const ordered = settings.order === "random"
      ? seededShuffle(queue, `${contest.id || ""}:hidden-rules`)
      : queue;
    const count = Math.floor(elapsed / settings.periodMinutes);
    visible = ordered.slice(0, count).map((item, index) => ({
      rule: item.rule,
      minute: (index + 1) * settings.periodMinutes,
    }));
  } else {
    visible = chosen
      .filter((item) => item.hidden !== true && item.revealMinute !== null && elapsed >= item.revealMinute)
      .map((item) => ({ rule: item.rule, minute: item.revealMinute }));
  }
  return visible.map(({ rule, minute }) => ({
    id: rule.id,
    title: rule.title,
    text: revealedRuleText(contest, rule),
    minute,
  }));
}

function revealedRuleText(contest, rule) {
  const item = cleanHiddenRuleSettings(contest?.hiddenRules).items.find((entry) => entry.id === rule.id);
  if (rule.id === "cell-steal") {
    const seconds = Number.isInteger(item?.seconds) && item.seconds >= 1 && item.seconds <= 3600 ? item.seconds : 45;
    return `If one team solves a problem and another team solves that same problem within ${seconds} seconds, the second team takes the cell. The first team loses that cell and the marks scored on it.`;
  }
  if (rule.id === "map-multiplier") {
    const factor = item?.multiplier ?? 1;
    const mapName = typeof contest?.mapNames?.[item?.mapId] === "string" && contest.mapNames[item.mapId]
      ? contest.mapNames[item.mapId]
      : "the chosen map";
    return `Problems on ${mapName} are worth ${factor} times their marks when a team solves one there.`;
  }
  if (rule.id === "solve-burst") {
    const burst = cleanBurstSettings(item);
    const mark = pointPhrase(burst.points);
    return `If a team solves ${burst.count} problems and each solve is less than ${burst.seconds} seconds after the one before it, that team gains ${mark} at once. The count then returns to zero.`;
  }
  return rule.text;
}

export default function hiddenRulesCatalogRoute(_req, res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ success: false, message: "Not found" }));
}
