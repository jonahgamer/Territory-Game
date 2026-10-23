import { api } from "./api.js?v=page-data";
import { noteServerTime } from "./contest-time.js";
import { normalizeContest } from "./contest-data.js";

export async function loadPage(action, params = {}) {
  const data = await api.page(action, params);
  noteServerTime(data.serverNow);
  if (data.contest) data.contest = normalizeContest(data.contest);
  return data;
}

export async function loadBootstrap() {
  const data = await api.bootstrap();
  noteServerTime(data.serverNow);
  return {
    user: data.user,
    maps: Array.isArray(data.maps) ? data.maps : [],
    problems: Array.isArray(data.problems) ? data.problems : [],
    contests: Array.isArray(data.contests) ? data.contests.map(normalizeContest) : [],
    versions: Array.isArray(data.versions) ? data.versions : [],
    revisions: data.revisions || { maps: 0, problems: 0, contests: 0 },
    serverNow: data.serverNow,
  };
}