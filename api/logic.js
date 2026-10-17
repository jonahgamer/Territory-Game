import vm from 'node:vm';

const TIMEOUT_MS = 1000;

function readScore(value) {
  // null / undefined mean "not set", not "zero".
  if (value === null || value === undefined) return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, score));
}

function interpret(result) {
  try {
    let score = readScore(result.score) ?? 0;
    let comment = typeof result.comment === 'string' ? result.comment.slice(0, 500) : '';
    const returned = result.returned;

    if (typeof returned === 'boolean') {
      score = returned ? 100 : 0;
    } else if (typeof returned === 'number') {
      score = readScore(returned) ?? 0;
    } else if (returned && typeof returned === 'object') {
      const returnedScore = readScore(returned.score);
      if (returnedScore !== null) score = returnedScore;
      if (typeof returned.comment === 'string') comment = returned.comment.slice(0, 500);
      if (returned.correct === true) score = 100;
      else if (returned.correct === false) score = 0;
    }

    return {
      correct: score === 100,
      systemError: false,
      score,
      comment,
    };
  } catch {
    // A returned object with a hostile getter / Proxy trap.
    return {
      correct: false,
      systemError: true,
      score: 0,
      comment: 'The checker could not run.',
    };
  }
}

// JSON.stringify already produces a valid JS string literal, but it
// leaves U+2028 and U+2029 raw. Those are line terminators in JS, so
// escape them to keep the literal on one line.
function jsStringLiteral(value) {
  return JSON.stringify(String(value))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function runProblemLogic(code, expected, given) {
  // Empty context: vm gives it its own Array, Object, Math, JSON, Set,
  // Map, Date, RegExp, Error, Promise, ... all of which are tied to the
  // context-local Function, so `Array.constructor('...')()` cannot
  // reach the host Function.
  const context = vm.createContext({}, {
    codeGeneration: { strings: false, wasm: false },
  });

  // Everything the script sees is created inside the context. The host
  // does not hand over any objects, so `answer.constructor`,
  // `result.constructor`, `"".constructor` etc. all point at the
  // context's own (locked-down) constructors.
  vm.runInContext(`
    globalThis.answer = ${jsStringLiteral(given ?? '')};
    globalThis.expected = ${jsStringLiteral(expected ?? '')};
    globalThis.result = { score: 0, comment: "", returned: undefined };
    globalThis.console = { log(){}, error(){}, warn(){}, info(){}, debug(){} };
  `, context, { timeout: TIMEOUT_MS });

  const source = `"use strict";
result.returned = (function () {
${code}
})();
`;

  try {
    new vm.Script(source, { filename: 'problem-logic.js' })
      .runInContext(context, { timeout: TIMEOUT_MS });
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

  // Read the outcome back as plain data. The host never keeps a live
  // reference to anything the script could have touched.
  const snapshot = vm.runInContext(
    '({ score: result.score, comment: result.comment, returned: result.returned })',
    context
  );
  return interpret(snapshot);
}