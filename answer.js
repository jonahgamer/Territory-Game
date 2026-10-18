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


const STATEMENT_KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css";
const STATEMENT_KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js";
const STATEMENT_AUTO_RENDER_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js";
const statementFrames = new WeakMap();

function escapeStatementText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let activeStatementFrame = null;
let pendingStatementSubmit = null;

function buildStatementDocument(source, tag = "") {
  const text = String(source || "");
  const tagText = escapeStatementText(tag);
  const body = containsHtml(text)
    ? text
    : `<pre class="statement-text">${escapeStatementText(text)}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${STATEMENT_KATEX_CSS}" crossorigin="anonymous">
<style>
  html, body { margin: 0; padding: 0; background: #081220; color: #d7f6ff; }
  body { font-family: "Share Tech Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 20px; line-height: 1.55; }
  #territory-bridge { display: none; }
  .statement-content { overflow-wrap: anywhere; }
  .statement-content pre { margin: 0; white-space: pre-wrap; overflow: auto; }
  .statement-content img, .statement-content video,
  .statement-content canvas, .statement-content svg { max-width: 100%; height: auto; }
  .statement-content table { max-width: 100%; border-collapse: collapse; }
  .statement-content a { color: #3ee0ff; }
</style>
<script src="${STATEMENT_KATEX_JS}" crossorigin="anonymous"></script>
<script src="${STATEMENT_AUTO_RENDER_JS}" crossorigin="anonymous"></script>
<script>
(function () {
  function report() {
    try {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ type: "territory-statement-height", height: height }, "*");
    } catch (error) {}
  }
  function renderMath() {
    if (typeof renderMathInElement !== "function") return;
    try {
      renderMathInElement(document.querySelector(".statement-content"), {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\\\[", right: "\\\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\\\(", right: "\\\\)", display: false }
        ],
        throwOnError: false,
        strict: "ignore"
      });
    } catch (error) {}
  }
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    renderMath();
    report();
    try {
      if (window.ResizeObserver) new ResizeObserver(report).observe(document.documentElement);
    } catch (error) {}
    try {
      new MutationObserver(report).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    } catch (error) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("load", boot);
})();
</script>
</head><body>
<div id="territory-bridge" aria-hidden="true">
  <span id="student-problem-tag">${tagText}</span>
  <form id="student-answer-form"><button type="submit">Submit</button></form>
  <input id="student-answer" type="text" />
  <p id="student-answer-error" hidden></p>
</div>
<script>
(function () {
  var input = document.getElementById("student-answer");
  var form = document.getElementById("student-answer-form");
  var err = document.getElementById("student-answer-error");
  if (!input || !form || !err) return;
  var answer = "";
  var readOnly = false;
  var errorHidden = true;
  var errorText = "";
  function post(type, data) {
    try {
      var message = { type: type };
      if (data) for (var key in data) if (Object.prototype.hasOwnProperty.call(data, key)) message[key] = data[key];
      parent.postMessage(message, "*");
    } catch (error) {}
  }
  Object.defineProperty(input, "value", {
    get: function () { return answer; },
    set: function (next) { answer = String(next == null ? "" : next); post("territory-answer-value", { value: answer }); }
  });
  var styleProxy = {};
  Object.defineProperty(styleProxy, "cssText", {
    get: function () { return input.getAttribute("style") || ""; },
    set: function (next) {
      var css = String(next == null ? "" : next);
      input.setAttribute("style", css);
      post("territory-answer-style", { cssText: css });
    }
  });
  Object.defineProperty(input, "style", { get: function () { return styleProxy; } });
  Object.defineProperty(input, "readOnly", {
    get: function () { return readOnly; },
    set: function (next) {
      readOnly = !!next;
      if (readOnly) input.setAttribute("readonly", "readonly");
      else input.removeAttribute("readonly");
      post("territory-answer-readonly", { readOnly: readOnly });
    }
  });
  function postError() { post("territory-answer-error", { hidden: errorHidden, text: errorText }); }
  Object.defineProperty(err, "hidden", {
    get: function () { return errorHidden; },
    set: function (next) { errorHidden = !!next; postError(); }
  });
  Object.defineProperty(err, "textContent", {
    get: function () { return errorText; },
    set: function (next) { errorText = String(next == null ? "" : next); postError(); }
  });
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "territory-before-submit") return;
    var blocked = false;
    var button = form.querySelector("button");
    if (button) {
      var click = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      button.dispatchEvent(click);
      blocked = click.defaultPrevented;
    }
    post("territory-submit-result", { id: data.id, blocked: blocked, message: errorHidden ? "" : errorText });
  });
})();
</script>
<div class="statement-content">${body}</div>
</body></html>`;
}

// Problem HTML runs in a sandboxed iframe. It may use its own scripts and the
// hidden answer bridge, but it cannot reach the parent page or close button.
function setRichText(element, source, options = {}) {
  const text = String(source || "");
  element.replaceChildren();
  element.classList.add("rich-html", "isolated-statement");
  const frame = document.createElement("iframe");
  frame.className = "statement-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("title", "Problem statement");
  frame.style.height = "120px";
  frame.srcdoc = buildStatementDocument(text, options.tag || "");
  element.append(frame);
  if (frame.contentWindow) statementFrames.set(frame.contentWindow, frame);
  return frame;
}

function approveStatementSubmit() {
  const frame = activeStatementFrame;
  if (!frame || !frame.contentWindow) return Promise.resolve({ blocked: false, message: "" });
  if (pendingStatementSubmit) {
    clearTimeout(pendingStatementSubmit.timer);
    pendingStatementSubmit.resolve({ blocked: false, message: "" });
    pendingStatementSubmit = null;
  }
  return new Promise((resolve) => {
    const id = `statement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      if (pendingStatementSubmit && pendingStatementSubmit.id === id) {
        pendingStatementSubmit = null;
        resolve({ blocked: false, message: "" });
      }
    }, 300);
    pendingStatementSubmit = {
      id,
      timer,
      resolve: (result) => { clearTimeout(timer); resolve(result); },
    };
    try {
      frame.contentWindow.postMessage({ type: "territory-before-submit", id }, "*");
    } catch (error) {
      clearTimeout(timer);
      pendingStatementSubmit = null;
      resolve({ blocked: false, message: "" });
    }
  });
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;
  const frame = statementFrames.get(event.source);
  if (!frame) return;
  if (data.type === "territory-statement-height") {
    const height = Number(data.height);
    if (!Number.isFinite(height)) return;
    frame.style.height = `${Math.max(48, Math.min(8000, Math.ceil(height)))}px`;
    return;
  }
  if (frame !== activeStatementFrame) return;
  if (data.type === "territory-answer-value" && answer) {
    answer.value = String(data.value == null ? "" : data.value);
  } else if (data.type === "territory-answer-style" && answer) {
    answer.style.cssText = String(data.cssText == null ? "" : data.cssText);
  } else if (data.type === "territory-answer-readonly" && answer) {
    answer.readOnly = data.readOnly === true;
  } else if (data.type === "territory-answer-error" && error) {
    error.hidden = data.hidden === true;
    error.textContent = String(data.text == null ? "" : data.text);
  } else if (data.type === "territory-submit-result" && pendingStatementSubmit && pendingStatementSubmit.id === data.id) {
    const pending = pendingStatementSubmit;
    pendingStatementSubmit = null;
    clearTimeout(pending.timer);
    pending.resolve({
      blocked: data.blocked === true,
      message: String(data.message == null ? "" : data.message),
    });
  }
});
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
  
  const promptText = problem?.prompt?.trim() ? problem.prompt : "This problem has no text yet.";
  activeStatementFrame = setRichText(prompt, promptText, { tag: title.textContent });
  
  // 脚本执行完后，将焦点放到输入框上（如果它还可见的话）
  if (answer.offsetParent !== null) {
    answer.focus();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;
  const button = form.querySelector("button");
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Checking...";

  const approval = await approveStatementSubmit();
  if (approval.blocked) {
    button.disabled = false;
    button.textContent = label;
    error.hidden = false;
    error.textContent = approval.message || "Finish the problem before submitting.";
    return;
  }

  try {
    await api("solve", { contestId, cell: cellIndex, answer: answer.value });
    form.hidden = true;
    showStatus("Answer recorded. You can close this tab.");
  } catch (failure) {
    error.hidden = false;
    error.textContent = failure.message;
    button.disabled = false;
    button.textContent = label;
  }
});

loadProblem().catch((failure) => {
  showStatus(failure.message || "The problem could not be opened.");
  form.hidden = true;
});