import { api } from "./api.js?v=roles";
import { noteServerTime } from "./contest-time.js";
import { normalizeContest } from "./contest-data.js?v=leaderboard";

export async function loadPage(action, params = {}) {
  const data = await api.page(action, params);
  noteServerTime(data.serverNow);
  if (data.contest) data.contest = normalizeContest(data.contest);
  return data;
}
