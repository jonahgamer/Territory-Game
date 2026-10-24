import { SESSION_KEY } from "./constants.js";

export function readStoredSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!stored || typeof stored.token !== "string" || !stored.user) return null;
    if (tokenExpired(stored.token)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const username = String(stored.user.username || "").trim();
    if (!username) return null;
    return {
      token: stored.token,
      user: {
        username,
        displayName: String(stored.user.displayName || username),
        role: normalizeRole(stored.user.role),
        pfp: safePfp(stored.user.pfp),
      },
    };
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
}

export function tokenExpired(token) {
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

export function safePfp(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url || url.length > 500) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
  } catch { return ""; }
  return "";
}

let _session = readStoredSession();

export function getSession() { return _session; }
export function setSession(session) { _session = session; saveSession(session); }

export function isSignedIn() {
  return Boolean(_session?.user?.username && _session.token);
}
export function normalizeRole(role) {
  if (role === "root" || role === "admin") return role;
  return "student";
}

export function isRoot() {
  return _session?.user?.role === "root";
}

export function isAdmin() {
  return _session?.user?.role === "admin" || _session?.user?.role === "root";
}
export function isContestant() {
  return isSignedIn() && !isAdmin();
}
export function contestantId() {
  return _session?.user?.username || "";
}
export function sameContestant(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

export function requireSession(redirectTo = "/login.html") {
  if (isSignedIn()) return true;
  location.replace(redirectTo);
  return false;
}

export function requireAdmin(redirectTo = "/login.html") {
  if (!isSignedIn()) { location.replace(redirectTo); return false; }
  if (!isAdmin()) { location.replace("/index.html"); return false; }
  return true;
}

export function requireContestant(redirectTo = "/login.html") {
  if (!isSignedIn()) { location.replace(redirectTo); return false; }
  if (!isContestant()) { location.replace("/admin/maps.html"); return false; }
  return true;
}

export function logOut() {
  setSession(null);
  location.replace("/login.html");
}