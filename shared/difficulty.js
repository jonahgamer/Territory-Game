import { PROBLEM_TYPES, DIFFICULTIES, DIFFICULTY_NAME, DIFFICULTY_SCORE, MAX_PROBLEM_SCORE } from "./constants.js";

export function typeInfo(type) {
  return PROBLEM_TYPES.find((item) => item.id === type) || null;
}

export function problemTag(index, type) {
  const info = typeInfo(type) || typeInfo("math");
  return `${info.tag}${index}`;
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