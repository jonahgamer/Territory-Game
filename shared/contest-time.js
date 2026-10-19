import { MAX_CONTEST_MINUTES } from "./constants.js";

let serverOffsetMs = 0;

export function serverNow() { return Date.now() + serverOffsetMs; }
export function noteServerTime(serverNowMs) {
  if (typeof serverNowMs === "number" && Number.isFinite(serverNowMs)) {
    serverOffsetMs = serverNowMs - Date.now();
  }
}

export function contestSchedule(contest) {
  if (!contest || !Number.isInteger(contest.startAt)) return null;
  const duration = contest.durationMinutes;
  const spawn = contest.spawnMinutes;
  const ready = contest.readyMinutes;
  if (![duration, spawn, ready].every((v) => Number.isInteger(v))) return null;
  if (duration < 1 || duration > MAX_CONTEST_MINUTES) return null;
  if (spawn < 0 || ready < 0 || spawn > MAX_CONTEST_MINUTES || ready > MAX_CONTEST_MINUTES) return null;
  if (spawn + ready >= duration) return null;
  const minute = 60 * 1000;
  return {
    startAt: contest.startAt,
    spawnEnd: contest.startAt + spawn * minute,
    liveAt: contest.startAt + (spawn + ready) * minute,
    endAt: contest.startAt + duration * minute,
    duration, spawn, ready,
  };
}

export function contestPhase(contest, now = serverNow()) {
  const schedule = contestSchedule(contest);
  if (!schedule) return "unscheduled";
  if (now < schedule.startAt) return "before";
  if (now < schedule.spawnEnd) return "spawn";
  if (now < schedule.liveAt) return "ready";
  if (now < schedule.endAt) return "live";
  return "ended";
}

export function formatContestTime(ms) {
  const d = new Date(ms);
  const p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function formatContestPicker(ms) {
  const d = new Date(ms);
  const p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function parseContestTime(value) {
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const year = +m[1], month = +m[2], day = +m[3];
  const hour = +m[4], minute = +m[5];
  const second = m[6] === undefined ? 0 : +m[6];
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) return null;
  return date.getTime();
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (v) => String(v).padStart(2, "0");
  if (h > 0) return `${h}:${p(m)}:${p(s)}`;
  return `${m}:${p(s)}`;
}

export function phaseClock(contest, now = serverNow()) {
  const phase = contestPhase(contest, now);
  const schedule = contestSchedule(contest);
  if (!schedule) return "Schedule not set";
  if (phase === "ended") return "Ended";
  const end = phase === "before" ? schedule.startAt
    : phase === "spawn" ? schedule.spawnEnd
    : phase === "ready" ? schedule.liveAt
    : schedule.endAt;
  const label = phase === "before" ? "Until spawning"
    : phase === "spawn" ? "Spawn time left"
    : phase === "ready" ? "Until the contest"
    : "Contest time left";
  return `${label} ${formatCountdown(end - now)}`;
}

export function phaseLabel(contest) {
  const phase = contestPhase(contest);
  const schedule = contestSchedule(contest);
  if (!schedule) return "Schedule not set";
  if (phase === "before") return `Starts ${formatContestTime(schedule.startAt)}`;
  if (phase === "spawn") return "Agreeing on spawn points";
  if (phase === "ready") return "Waiting for the contest";
  if (phase === "live") return "Contest in progress";
  return "Ended";
}

export function phaseSentence(contest, phase, frozen = false) {
  const schedule = contestSchedule(contest);
  if (!schedule) return "The schedule is not set yet.";
  if (frozen && phase !== "ended") return "Every problem is solved. The board is frozen.";
  if (phase === "before") {
    if (schedule.spawn === 0) return `The contest begins ${formatContestTime(schedule.liveAt)}.`;
    return `Spawning starts ${formatContestTime(schedule.startAt)} and lasts ${schedule.spawn} min. The contest begins ${formatContestTime(schedule.liveAt)}.`;
  }
  if (phase === "spawn") {
    return contest.spawnResolved
      ? `Spawn points are assigned. The wait begins ${formatContestTime(schedule.spawnEnd)}.`
      : "Agree on one spawn point with your team before this phase ends.";
  }
  if (phase === "ready") return `Spawning is closed. The contest begins ${formatContestTime(schedule.liveAt)}. Your team's outline is white.`;
  if (phase === "live") return `Solve a problem next to your territory before ${formatContestTime(schedule.endAt)}. Easy is 1, normal 2, hard 3, and insane 4.`;
  return `The contest ended ${formatContestTime(schedule.endAt)}. The board is frozen.`;
}

export function readWholeMinutes(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_CONTEST_MINUTES) return null;
  return n;
}

export function readSchedule(startValue, durationValue, spawnValue, readyValue) {
  const startAt = parseContestTime(startValue);
  const durationMinutes = readWholeMinutes(durationValue);
  const spawnMinutes = readWholeMinutes(spawnValue);
  const readyMinutes = readWholeMinutes(readyValue);
  if (startAt === null) return { error: "Choose a start date and time." };
  if (durationMinutes === null || spawnMinutes === null || readyMinutes === null) {
    return { error: "Use whole minutes from 0 to 10080. Duration must be at least 1." };
  }
  if (durationMinutes < 1) return { error: "Duration must be at least 1 minute." };
  if (spawnMinutes + readyMinutes >= durationMinutes) {
    return { error: "Spawn time and the wait before the contest must be shorter than the duration." };
  }
  return { startAt, durationMinutes, spawnMinutes, readyMinutes };
}