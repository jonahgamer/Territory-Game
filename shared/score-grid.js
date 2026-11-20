import { el } from "./dom.js";

function scoreNumber(points) {
  const n = Math.round(Number(points) * 10) / 10;
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function ruleLabels(rows) {
  const labels = [];
  for (const row of rows) {
    for (const rule of row.rules || []) {
      if (rule && typeof rule.label === "string" && !labels.includes(rule.label)) labels.push(rule.label);
    }
  }
  return labels;
}

function figures(row, labels) {
  const byLabel = new Map((row.rules || []).map((rule) => [rule.label, Number(rule.points) || 0]));
  const values = labels.map((label) => byLabel.get(label) || 0);
  const summed = Math.round(values.reduce((sum, points) => sum + points, 0) * 10) / 10;
  const ruleTotal = Number.isFinite(Number(row.ruleTotal)) ? Math.round(Number(row.ruleTotal) * 10) / 10 : summed;
  const basic = Number.isFinite(Number(row.basic))
    ? Math.round(Number(row.basic) * 10) / 10
    : Math.round((Number(row.rankScore) - ruleTotal) * 10) / 10;
  return { values, ruleTotal, basic };
}

export function renderScoreGrid(host, rows) {
  if (!host) return;
  host.replaceChildren();
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return;
  const labels = ruleLabels(list);
  const detailed = list.some((row) => Array.isArray(row.rules));
  const table = document.createElement("table");
  table.className = "score-grid";
  const head = document.createElement("thead");
  const titles = ["Team", ...labels];
  if (detailed) titles.push("Basic score", "Gained by rules", "Final score");
  else titles.push("Final score");
  const headRow = document.createElement("tr");
  for (const title of titles) headRow.append(el("th", null, title));
  head.append(headRow);
  const body = document.createElement("tbody");
  list.forEach((row, index) => {
    const line = document.createElement("tr");
    line.append(el("td", "score-team", `${index + 1}. ${row.name}`));
    if (detailed) {
      const numbers = figures(row, labels);
      for (const points of numbers.values) line.append(el("td", null, scoreNumber(points)));
      line.append(
        el("td", null, scoreNumber(numbers.basic)),
        el("td", null, scoreNumber(numbers.ruleTotal)),
        el("td", "score-final", scoreNumber(row.rankScore))
      );
    } else {
      line.append(el("td", "score-final", scoreNumber(row.rankScore)));
    }
    body.append(line);
  });
  table.append(head, body);
  host.append(table);
}
