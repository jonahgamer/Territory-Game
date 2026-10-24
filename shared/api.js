import { API_BASE, LOGIN_URL } from "./constants.js";
import { getSession, logOut } from "./session.js?v=roles";

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

function authedGet(search) {
  const session = getSession();
  const headers = {};
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  return request(`${API_BASE}?${search}`, { method: "GET", headers });
}

export const api = {
  bootstrap: () => apiCall("bootstrap"),
  page: (action, params = {}) => {
    const search = new URLSearchParams({ action });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    }
    return authedGet(search);
  },
  saveMap: (map, revision) => apiCall("save-map", { map, revision }),
  deleteMap: (mapId, revision) => apiCall("delete-map", { mapId, revision }),
  saveProblem: (problem, revision) => apiCall("save-problem", { problem, revision }),
  addProblems: (problems, revision) => apiCall("add-problems", { problems, revision }),
  deleteProblems: (problems, revision) => apiCall("delete-problems", { problems, revision }),
  moveProblem: (from, to, revision) => apiCall("move-problem", { from, to, revision }),
  problemText: (items) => apiCall("page-problem-text", { items }),
  saveContest: (contest, revision) => apiCall("save-contest", { contest, revision }),
  deleteContest: (contestId, revision) => apiCall("delete-contest", { contestId, revision }),
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