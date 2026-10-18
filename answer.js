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
  try {
    renderMathInElement(element, { delimiters: MATH_DELIMITERS, throwOnError: false, strict: "ignore" });
  } catch (error) {
    console.error("[math]", error);
  }
}

function containsHtml(source) {
  return /<\/?[a-z][\w:-]*\b[^>]*>/i.test(source);
}


const STATEMENT_STYLE = `
  :host { display: block; }
  .statement-content { font: inherit; line-height: 1.55; overflow-wrap: anywhere; }
  .statement-content img,
  .statement-content video,
  .statement-content canvas,
  .statement-content svg { max-width: 100%; height: auto; }
  .statement-content table { max-width: 100%; border-collapse: collapse; }
  .statement-content pre { overflow: auto; white-space: pre-wrap; }
  .statement-content a { color: #3ee0ff; }
`;

function sanitizeProblemFragment(source) {
  const template = document.createElement("template");
  template.innerHTML = source;
  template.content
    .querySelectorAll("script, style, iframe, object, embed, base, meta, link, form, template, frame, frameset, applet")
    .forEach((node) => node.remove());
  for (const element of template.content.querySelectorAll("*")) {
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "autofocus") {
        element.removeAttribute(attr.name);
        continue;
      }
      if (["href", "xlink:href", "src", "action", "formaction"].includes(name) && value.startsWith("javascript:")) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (name === "style" && value.includes("javascript:")) element.removeAttribute(attr.name);
    }
    if (element.tagName.toUpperCase() === "A" || element.tagName.toUpperCase() === "AREA") element.removeAttribute("href");
  }
  return template.content;
}

function setRichText(element, source) {
  const text = String(source || "");
  element.replaceChildren();
  element.classList.add("rich-html", "isolated-statement");
  element.style.contain = "content";
  element.style.isolation = "isolate";
  const root = element.shadowRoot || element.attachShadow({ mode: "open" });
  root.replaceChildren();
  if (!text.trim()) return;

  const base = document.createElement("style");
  base.textContent = STATEMENT_STYLE;
  root.append(base);
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (link.href && /katex/i.test(link.href)) root.append(link.cloneNode(true));
  }

  const wrapper = document.createElement("div");
  wrapper.className = "statement-content";
  const hasHtml = containsHtml(text);
  wrapper.style.whiteSpace = hasHtml ? "normal" : "pre-wrap";
  if (hasHtml) wrapper.append(sanitizeProblemFragment(text));
  else wrapper.textContent = text;
  root.append(wrapper);
  renderMath(wrapper);
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
    setRichText(prompt, "This problem has no text yet.");
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