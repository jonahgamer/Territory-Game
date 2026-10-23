import { API_BASE, LOGIN_URL } from "./constants.js";
import { getSession, logOut } from "./session.js";

const DEFAULT_TIMEOUT_MS = 30000;

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      if (response.status === 401) {
        logOut();
        return new Promise(() => {}); // 页面即将跳转
      }
      throw error;
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error("Request timed out.");
      e.timeout = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiCall(action, body) {
  const session = getSession();
  const headers = {};
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  if (body !== undefined) {
    return request(API_BASE, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, ...body }),
    });
  }
  return request(`${API_BASE}?action=${encodeURIComponent(action)}`, {
    method: "GET",
    headers,
  });
}

export async function login(username, password) {
  return request(LOGIN_URL, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export const api = {
  bootstrap: () => apiCall("bootstrap"),
  saveMaps: (maps, revision) => apiCall("save-maps", { maps, revision }),
  saveProblems: (problems, revision) => apiCall("save-problems", { problems, revision }),
  saveContests: (contests, revision) => apiCall("save-contests", { contests, revision }),
  saveTeam: (body) => apiCall("save-team", body),
  removeTeam: (body) => apiCall("remove-team", body),
  chooseSpawn: (contestId, cell, mapId) => apiCall("choose-spawn", { contestId, cell, mapId }),
  solve: (contestId, cell, answer, mapId) => apiCall("solve", { contestId, cell, answer, mapId }),
  claimTeleport: (contestId, mapId, cell) => apiCall("claim-teleport", { contestId, mapId, cell }),
  contestState: (contestId) => apiCall("contest-state", { contestId }),
  listAccounts: () => apiCall("list-accounts"),
  createAccount: (body) => apiCall("create-account", body),
  updateAccount: (body) => apiCall("update-account", body),
  deleteAccount: (username) => apiCall("delete-account", { username }),
  addVersion: (version, message) => apiCall("add-version", { version, message }),
  deleteVersion: (id) => apiCall("delete-version", { id }),
  testProblem: (logic, expected, answer) => apiCall("test-problem", { logic, expected, answer }),
};