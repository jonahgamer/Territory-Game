// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function typeInfo(type) {
  return PROBLEM_TYPES.find((item) => item.id === type) || null;
}

function problemTag(index, type) {
  const info = typeInfo(type) || typeInfo("math");
  return `${info.tag}${index}`;
}

function findProblem(index, type) {
  return problems.find((problem) => problem.index === index && problem.type === type) || null;
}

function blankProblem(index) {
  return { index, type: "math", prompt: "", answer: "", logic: "", difficulty: "normal" };
}

function problemDifficulty(problem) {
  return DIFFICULTIES.includes(problem?.difficulty) ? problem.difficulty : "normal";
}

function cellClassName(cell, ...extra) {
  const parts = [...extra, cell.kind];
  if (cell.kind === "problem") {
    if (!extra.includes("student-cell")) parts.push(typeInfo(cell.type) ? cell.type : "math");
    parts.push(cellDifficulty(cell));
  }
  return parts.join(" ");
}

function cellDifficulty(cell) {
  return problemDifficulty(findProblem(cell.problemNo, cell.type));
}

function cellText(cell) {
  if (cell.kind === "problem") return problemTag(cell.problemNo, cell.type);
  if (cell.kind === "spawnpoint") return "S";
  return "";
}

function cellLabel(cell, row, column) {
  if (cell.kind === "problem") return `Row ${row}, column ${column}, problem ${problemTag(cell.problemNo, cell.type)}`;
  if (cell.kind === "obstacle") return `Row ${row}, column ${column}, obstacle`;
  if (cell.kind === "spawnpoint") return `Row ${row}, column ${column}, spawn point`;
  return `Row ${row}, column ${column}, empty`;
}

function emptyCells(count) {
  return Array.from({ length: count }, () => ({ kind: "empty" }));
}

function readSize(value) {
  const size = Number(value);
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) return null;
  return size;
}

function readProblemNo(value) {
  const problemNo = Number(value);
  if (!Number.isInteger(problemNo) || problemNo < MIN_PROBLEM_NO || problemNo > MAX_PROBLEM_NO) {
    return null;
  }
  return problemNo;
}


