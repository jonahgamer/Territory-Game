// Hidden rules live only in this file.
// Add one object per rule. The website cannot create rules.
// id stays the same forever. title is the short name admins see.
// text is what contestants read after the rule is revealed.
//
// { id: "short-name", title: "Short name", text: "The rule, in plain words." }

export const HIDDEN_RULES = [];

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

export function cleanHiddenRuleSettings(value) {
  const known = new Set(hiddenRuleCatalog().map((rule) => rule.id));
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
    items.push({ id, revealMinute, hidden: raw?.hidden === true });
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
    text: rule.text,
    minute,
  }));
}

export default function hiddenRulesCatalogRoute(_req, res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ success: false, message: "Not found" }));
}
