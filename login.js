const SESSION_KEY = "territory-game-session";
const LOGIN_URL = "/api/login";

const loginForm = document.querySelector("#login-form");
const loginUsername = document.querySelector("#login-username");
const loginPassword = document.querySelector("#login-password");
const loginError = document.querySelector("#login-error");
const loginSubmit = document.querySelector("#login-submit");

if (readStoredSession()) {
  location.replace("index.html");
} else {
  loginForm.addEventListener("submit", logIn);
  loginUsername.focus();
}

async function logIn(event) {
  event.preventDefault();
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  if (!username || !password) {
    showLoginError("Enter your username and password.");
    return;
  }

  loginSubmit.disabled = true;
  loginError.hidden = true;
  try {
    const response = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.token || !data.user?.username) {
      showLoginError(loginFailureMessage(response, data));
      return;
    }

    const user = {
      username: String(data.user.username),
      displayName: String(data.user.displayName || data.user.username),
      role: data.user.role === "root" || data.user.role === "admin" ? data.user.role : "student",
      pfp: safePfp(data.user.pfp),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, user }));
    loginPassword.value = "";
    location.replace("index.html");
  } catch {
    showLoginError("Could not reach the server.");
  } finally {
    loginSubmit.disabled = false;
  }
}

function showLoginError(message) {
  loginError.hidden = false;
  loginError.textContent = message;
}

function loginFailureMessage(response, data) {
  if (typeof data.message === "string" && data.message) return data.message;
  if (response.status === 429) return "Too many login attempts. Please try again later.";
  if (response.status === 401) return "Invalid username or password";
  if (response.status === 404) return "Login is not available on this server.";
  return "Could not sign in.";
}

function readStoredSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!stored || typeof stored.token !== "string" || !stored.user?.username) return null;
    if (tokenExpired(stored.token)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function tokenExpired(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);
    return typeof data.exp !== "number" || data.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function safePfp(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url || url.length > 500) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
  } catch {
    return "";
  }
  return "";
}
