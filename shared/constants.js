export const MIN_SIZE = 1;
export const MAX_SIZE = 40;
export const MIN_PROBLEM_NO = 1;
export const MAX_PROBLEM_NO = 99999;
export const PROBLEM_YEAR = 26;
export const YEAR_INDEX_START = PROBLEM_YEAR * 1000;
export const YEAR_INDEX_END = PROBLEM_YEAR * 1000 + 999;
export const MAX_CONTEST_MINUTES = 10080;

export const PROBLEM_TYPES = [
  { id: "math", name: "Math", tag: "M" },
  { id: "oi", name: "OI", tag: "O" },
  { id: "science", name: "Science", tag: "S" },
  { id: "puzzle", name: "Puzzle", tag: "P" },
  { id: "testing", name: "Testing", tag: "T" },
];

export const DIFFICULTIES = ["easy", "normal", "hard", "insane"];
export const DIFFICULTY_SCORE = { easy: 1, normal: 2, hard: 3, insane: 4 };
export const DIFFICULTY_NAME = { easy: "Easy", normal: "Normal", hard: "Hard", insane: "Insane" };

export const TEAM_COLOR_LIMIT = 256;
export const CELL_SIZE = 50;
export const PROBLEM_PAGE_SIZE = 20;
export const RECENT_CLAIM_MS = 20000;

export const API_BASE = "/api/territory";
export const LOGIN_URL = "/api/login";
export const SESSION_KEY = "territory-game-session";
export const ANSWER_OPEN_MODE_KEY = "territory-answer-open-mode";