const STATEMENT_KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css";
const STATEMENT_KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js";
const STATEMENT_AUTO_RENDER_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js";
const statementFrames = new WeakMap();

function escapeStatementText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function containsHtml(source) {
  return /<\/?[a-z][\w:-]*\b[^>]*>/i.test(source);
}

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
  body { font-family: "Share Tech Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 16px; line-height: 1.55; }
  #territory-bridge { display: none; }
  .statement-content { overflow-wrap: anywhere; font-size: 16px; }
  .katex { font-size: 1em; }
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
      const height = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      parent.postMessage({ type: "territory-statement-height", height: height }, "*");
    } catch (e) {}
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
        throwOnError: false, strict: "ignore"
      });
    } catch (e) {}
  }
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    renderMath(); report();
    try { if (window.ResizeObserver) new ResizeObserver(report).observe(document.documentElement); } catch (e) {}
    try { new MutationObserver(report).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); } catch (e) {}
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
  var answer = "", readOnly = false, errorHidden = true, errorText = "";
  function post(type, data) {
    try {
      var message = { type: type };
      if (data) for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) message[k] = data[k];
      parent.postMessage(message, "*");
    } catch (e) {}
  }
  Object.defineProperty(input, "value", {
    get: function () { return answer; },
    set: function (v) { answer = String(v == null ? "" : v); post("territory-answer-value", { value: answer }); }
  });
  var styleProxy = {};
  Object.defineProperty(styleProxy, "cssText", {
    get: function () { return input.getAttribute("style") || ""; },
    set: function (v) { var css = String(v == null ? "" : v); input.setAttribute("style", css); post("territory-answer-style", { cssText: css }); }
  });
  Object.defineProperty(input, "style", { get: function () { return styleProxy; } });
  Object.defineProperty(input, "readOnly", {
    get: function () { return readOnly; },
    set: function (v) { readOnly = !!v; if (readOnly) input.setAttribute("readonly", "readonly"); else input.removeAttribute("readonly"); post("territory-answer-readonly", { readOnly: readOnly }); }
  });
  function postError() { post("territory-answer-error", { hidden: errorHidden, text: errorText }); }
  Object.defineProperty(err, "hidden", { get: function () { return errorHidden; }, set: function (v) { errorHidden = !!v; postError(); } });
  Object.defineProperty(err, "textContent", { get: function () { return errorText; }, set: function (v) { errorText = String(v == null ? "" : v); postError(); } });
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

export function createStatementView(container, options = {}) {
  let activeFrame = null;
  let pendingSubmit = null;

  function handleMessage(event) {
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
    if (frame !== activeFrame) return;
    if (data.type === "territory-answer-value") options.onAnswerValue?.(String(data.value ?? ""));
    else if (data.type === "territory-answer-style") options.onAnswerStyle?.(String(data.cssText ?? ""));
    else if (data.type === "territory-answer-readonly") options.onAnswerReadOnly?.(data.readOnly === true);
    else if (data.type === "territory-answer-error") options.onAnswerError?.(data.hidden === true, String(data.text ?? ""));
    else if (data.type === "territory-submit-result" && pendingSubmit && pendingSubmit.id === data.id) {
      const p = pendingSubmit;
      pendingSubmit = null;
      clearTimeout(p.timer);
      p.resolve({ blocked: data.blocked === true, message: String(data.message ?? "") });
    }
  }

  window.addEventListener("message", handleMessage);

  return {
    render(source, tag = "") {
      container.replaceChildren();
      container.classList.add("rich-html", "isolated-statement");
      const frame = document.createElement("iframe");
      frame.className = "statement-frame";
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("title", "Problem statement");
      frame.style.height = "120px";
      frame.srcdoc = buildStatementDocument(source, tag);
      container.append(frame);
      if (frame.contentWindow) statementFrames.set(frame.contentWindow, frame);
      activeFrame = frame;
      return frame;
    },
    approveSubmit() {
      const frame = activeFrame;
      if (!frame || !frame.contentWindow) return Promise.resolve({ blocked: false, message: "" });
      if (pendingSubmit) {
        clearTimeout(pendingSubmit.timer);
        pendingSubmit.resolve({ blocked: false, message: "" });
        pendingSubmit = null;
      }
      return new Promise((resolve) => {
        const id = `statement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timer = setTimeout(() => {
          if (pendingSubmit && pendingSubmit.id === id) {
            pendingSubmit = null;
            resolve({ blocked: false, message: "" });
          }
        }, 300);
        pendingSubmit = { id, timer, resolve: (r) => { clearTimeout(timer); resolve(r); } };
        try {
          frame.contentWindow.postMessage({ type: "territory-before-submit", id }, "*");
        } catch {
          clearTimeout(timer);
          pendingSubmit = null;
          resolve({ blocked: false, message: "" });
        }
      });
    },
    dispose() { window.removeEventListener("message", handleMessage); },
  };
}