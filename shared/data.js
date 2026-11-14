import { api } from "./api.js?v=page-data";
import { noteServerTime } from "./contest-time.js";
import { normalizeContest } from "./contest-data.js?v=part-score";

export async function loadPage(action, params = {}) {
  const data = await api.page(action, params);
  noteServerTime(data.serverNow);
  if (data.contest) data.contest = normalizeContest(data.contest);
  return data;
}
