import vm from 'node:vm';

const TIMEOUT_MS = 1000;

function readScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, score));
}

function interpret(result) {
  let score = readScore(result.score) ?? 0;
  let comment = typeof result.comment === 'string' ? result.comment.slice(0, 500) : '';
  const returned = result.returned;
  if (typeof returned === 'boolean') score = returned ? 100 : 0;
  else if (typeof returned === 'number') score = readScore(returned) ?? 0;
  else if (returned && typeof returned === 'object') {
    const returnedScore = readScore(returned.score);
    if (returnedScore !== null) score = returnedScore;
    if (typeof returned.comment === 'string') comment = returned.comment.slice(0, 500);
    if (returned.correct === true) score = 100;
  }
  return {
    correct: score === 100,
    systemError: false,
    score,
    comment,
  };
}

export function runProblemLogic(code, expected, given) {
  const result = { score: 0, comment: '', returned: undefined };
  const sandbox = {
    answer: String(given ?? ''),
    expected: String(expected ?? ''),
    result,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  };
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  const source = `"use strict";
result.returned = (function () {
${code}
})();
`;
  try {
    new vm.Script(source, { filename: 'problem-logic.js' }).runInContext(context, { timeout: TIMEOUT_MS });
  } catch (error) {
    const timedOut = /timed out/i.test(String(error?.message));
    console.error('[problem-logic]', timedOut ? 'timed out' : error);
    return {
      correct: false,
      systemError: true,
      score: 0,
      comment: timedOut ? 'The checker took too long.' : 'The checker could not run.',
    };
  }
  return interpret(sandbox.result);
}
