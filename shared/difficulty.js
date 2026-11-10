import { PROBLEM_TYPES, DIFFICULTIES, DIFFICULTY_NAME, DIFFICULTY_SCORE, MAX_PROBLEM_SCORE } from "./constants.js";

export function typeInfo(type) {
  return PROBLEM_TYPES.find((item) => item.id === type) || null;
}

export function problemTag(index, type) {
  const info = typeInfo(type) || typeInfo("math");
  return `${info.tag}${index}`;
}

export function problemYear(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 1000 || n > 99999) return null;
  return Math.floor(n / 1000);
}

export function yearTypeFrequency(problems, year) {
  const counts = {};
  for (const type of PROBLEM_TYPES) counts[type.id] = 0;
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1 || y > 99) return counts;
  const start = y * 1000;
  const end = start + 999;
  for (const problem of problems || []) {
    if (!Number.isInteger(problem?.index) || problem.index < start || problem.index > end) continue;
    if (counts[problem.type] === undefined) continue;
    counts[problem.type] += 1;
  }
  return counts;
}

export function problemDifficulty(problem) {
  return DIFFICULTIES.includes(problem?.difficulty) ? problem.difficulty : "normal";
}

export function difficultyName(d) { return DIFFICULTY_NAME[d] || "Normal"; }
export function difficultyScore(d) { return DIFFICULTY_SCORE[d] || 2; }

export function problemScore(problem) {
  const n = Number(problem?.score);
  if (Number.isInteger(n) && n >= 0 && n <= MAX_PROBLEM_SCORE) return n;
  return difficultyScore(problemDifficulty(problem));
}