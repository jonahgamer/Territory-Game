// ═══════════════════════════════════════════════════════════════════
// Session storage
// ═══════════════════════════════════════════════════════════════════

function readStoredSession() {
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
        role: stored.user.role === "admin" ? "admin" : "student",
        pfp: safePfp(stored.user.pfp),
      },
    };
  } catch {
    return null;
  }
}

function persistSession() {
  try {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Stay signed in for this visit if storage is unavailable.
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


