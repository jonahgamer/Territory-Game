const SESSION_KEY = "territory-game-session";
const API_BASE = "/api/territory";
const DIFFICULTY_NAME = { easy: "Easy", normal: "Normal", hard: "Hard", insane: "Insane" };
const DIFFICULTY_SCORE = { easy: 1, normal: 2, hard: 3, insane: 4 };
const MATH_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "$", right: "$", display: false },
  { left: "\\(", right: "\\)", display: false },
];

const params = new URLSearchParams(location.search);
const contestId = params.get("contest") || "";
const cellIndex = Number(params.get("cell"));
const status = document.querySelector("#answer-status");
const title = document.querySelector("#student-problem-tag");
const prompt = document.querySelector("#student-problem-prompt");
const form = document.querySelector("#student-answer-form");
const answer = document.querySelector("#student-answer");
const error = document.querySelector("#student-answer-error");

function readSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!stored?.token || !stored.user?.username) return null;
    return stored;
  } catch {
    return null;
  }
}

async function api(action, body) {
  const session = readSession();
  const headers = { "Content-Type": "application/json" };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(body ? API_BASE : `${API_BASE}?action=${encodeURIComponent(action)}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify({ action, ...body }) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

function renderMath(element) {
  if (!element || typeof renderMathInElement !== "function") return;
  renderMathInElement(element, { delimiters: MATH_DELIMITERS, throwOnError: false, strict: "ignore" });
}

function containsHtml(source) {
  return /<\/?[a-z][\w:-]*\b[^>]*>/i.test(source);
}

// 重新创建 script 节点以使其执行
function liveScript(old) {
  const fresh = document.createElement("script");
  for (const attr of old.attributes) {
    if (attr.name === "src") continue;
    fresh.setAttribute(attr.name, attr.value);
  }
  const src = old.getAttribute("src");
  if (src) fresh.src = src;
  else fresh.textContent = old.textContent;
  return fresh;
}

function setRichText(element, source) {
  element.replaceChildren();
  element.classList.remove("rich-html");
  const text = source || "";
  if (!text.trim()) return;
  if (!containsHtml(text)) {
    element.textContent = text;
    renderMath(element);
    return;
  }
  element.classList.add("rich-html");
  const template = document.createElement("template");
  template.innerHTML = text;
  
  // 将 script 提取出来并从 template 中移除
  const scripts = [...template.content.querySelectorAll("script")];
  for (const script of scripts) script.remove();
  
  element.append(template.content);
  renderMath(element);
  
  // 重新插入 script 以执行
  const runScripts = () => {
    if (!element.isConnected) return;
    for (const script of scripts) element.append(liveScript(script));
  };
  if (element.isConnected) runScripts();
  else queueMicrotask(runScripts);
}

function showStatus(message) {
  status.hidden = false;
  status.textContent = message;
}

function difficultyOf(problem) {
  return DIFFICULTY_SCORE[problem?.difficulty] ? problem.difficulty : "normal";
}

async function loadProblem() {
  const session = readSession();
  if (!session) {
    location.replace("login.html");
    return;
  }
  if (!contestId || !Number.isInteger(cellIndex) || cellIndex < 0) {
    showStatus("This problem link is not valid.");
    form.hidden = true;
    return;
  }
  
  const data = await api("bootstrap");
  const contest = (data.contests || []).find((item) => item.id === contestId);
  const map = contest && (data.maps || []).find((item) => item.id === contest.mapId);
  const mapCell = map?.cells?.[cellIndex];
  
  if (!contest || !map || mapCell?.kind !== "problem") {
    showStatus("That problem is not available.");
    form.hidden = true;
    return;
  }
  
  const problem = (data.problems || []).find((item) => item.index === mapCell.problemNo && item.type === mapCell.type);
  const difficulty = difficultyOf(problem);
  const points = DIFFICULTY_SCORE[difficulty];
  title.textContent = `${DIFFICULTY_NAME[difficulty]} · ${points} point${points === 1 ? "" : "s"}`;
  
  if (problem?.prompt?.trim()) {
    setRichText(prompt, problem.prompt);
  } else {
    prompt.textContent = "This problem has no text yet.";
  }
  
  // 脚本执行完后，将焦点放到输入框上（如果它还可见的话）
  if (answer.offsetParent !== null) {
    answer.focus();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await api("solve", { contestId, cell: cellIndex, answer: answer.value });
    form.hidden = true;
    showStatus("Answer recorded. You can close this tab.");
  } catch (failure) {
    error.hidden = false;
    error.textContent = failure.message;
    button.disabled = false;
  }
});

loadProblem().catch((failure) => {
  showStatus(failure.message || "The problem could not be opened.");
  form.hidden = true;
});