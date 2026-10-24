import { login, api } from "../shared/api.js?v=login-error";
import { readStoredSession, setSession, tokenExpired } from "../shared/session.js";

const form = document.querySelector("#login-form");
const usernameInput = document.querySelector("#login-username");
const passwordInput = document.querySelector("#login-password");
const errorEl = document.querySelector("#login-error");
const submit = document.querySelector("#login-submit");

if (readStoredSession()) {
  location.replace("index.html");
} else {
  form.addEventListener("submit", onSubmit);
  usernameInput.focus();
}

async function onSubmit(event) {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showError("Enter your username and password.");
    return;
  }
  submit.disabled = true;
  errorEl.hidden = true;
  try {
    const data = await login(username, password);
    if (!data.success || !data.token || !data.user?.username) {
      showError(data.message || "Could not sign in.");
      return;
    }
    const user = {
      username: String(data.user.username),
      displayName: String(data.user.displayName || data.user.username),
      role: data.user.role === "admin" ? "admin" : "student",
      pfp: String(data.user.pfp || ""),
    };
    setSession({ token: data.token, user });
    passwordInput.value = "";
    location.replace("index.html");
  } catch (err) {
    showError(err.status === 401 ? "Invalid username or password" : (err.message || "Could not reach the server."));
  } finally {
    submit.disabled = false;
  }
}

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}