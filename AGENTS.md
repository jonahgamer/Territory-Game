# Territory Game

Puzzle Territory is a Wah Yan College maths-team contest. Teams claim cells on a shared map by solving problems. This file is the map of the code. Endpoint details live in `TERRITORY_API.md`.

## Where to edit

The browser bundle `script.js` is generated. Change the numbered files in `scripts/`, then run:

```bash
npm run build:scripts
```

`scripts/batch-problems.js` is not part of that bundle. `index.html` loads it before `script.js`.

`scripts/01-core.js` currently starts with the generated-file banner. A rebuild will copy that banner into `script.js` again. Do not add a second copy.

Local site: `npm run dev` (`dev-server.mjs`). It loads `.env`, serves the project root, and runs `api/*.js` the way Vercel does. Needs `MONGODB_URI` and `JWT_SECRET`. Node 20+. Do not commit `.env`.

## Layout

| Path | Role |
| --- | --- |
| `index.html`, `style.css` | Main single-page app. Hash routes, listed in `TERRITORY_API.md`. |
| `scripts/01-core.js` | Constants, DOM lookups, API helper, hash router. |
| `scripts/02-events.js` | Listeners. Missing nodes are skipped so `/ui2/` can load the same bundle. |
| `scripts/03-persistence.js` | Debounced saves, revisions, dirty map/problem drafts. |
| `scripts/03-z-conflict.js` | 409 field-level diff when a save is stale. |
| `scripts/04-views.js` | Show/hide screens, mobile menu. |
| `scripts/05-map-crud.js` | Create, rename, delete maps. |
| `scripts/06-painting.js` | Cell paint, including touch-versus-scroll. |
| `scripts/07-map-rendering.js` | Grid drawing, pinch zoom. |
| `scripts/08-place-type.js` | Math / OI / Science / Puzzle while painting. |
| `scripts/09-problems.js` | Problem list, editor, bulk edit, KaTeX and HTML. |
| `scripts/10-problem-preview.js` | Admin preview of problem HTML. |
| `scripts/11-helpers.js` | Shared small helpers. |
| `scripts/12-session.js` | Admin versus student, team membership. |
| `scripts/13-contests.js` | Contest schedule, teams, spawn agreement, student play, countdown. |
| `scripts/14-session-storage.js` | JWT in `localStorage` key `territory-game-session`. |
| `scripts/15-bootstrap.js` | First load. Full app starts the router. `/ui2/` calls `openSplitPage()`. |
| `login.html`, `login.js` | Sign-in page. |
| `answer.html`, `answer.js` | One problem in a new tab: `?contest=&cell=`. |
| `ui2/*.html` | Split admin pages. They load `/script.js` and `/style.css`. Contests is still a dead link. Tutorial is `/ui2/editusers.html#tutorial`. |
| `api/login.js` | `POST /api/login`. |
| `api/territory.js` | Every other action. |
| `api/logic.js` | Sandboxed grader. |
| `api/_db.js` | Mongo connection and CORS. |
| `tools/seed-map-64spawns.mjs` | Builds a 30×30 practice map. See `tools/README.md`. |

## Auth and roles

JWT, 7 days, sent as `Authorization: Bearer`. Stored user is `{ token, user: { username, displayName, role, pfp } }`.

`admin` or `root` is an admin. Every other role is a student. Unsigned visitors go to `/login.html` (absolute, so `/ui2/` does not look for a login page in that folder).

Students do not receive `answer` or `logic`. Settings and Tutorial are admin-only. Credits is a label with no page.

Login looks up the exact username. A banned account gets the same error as a bad password. 20 attempts per IP per 5 minutes, stored in `login_attempts`. Missing `JWT_SECRET` is a 500.

## Data

Mongo database `territory_game` unless `MONGODB_DB` is set. Saves that replace a collection use a transaction, so the database must be a replica set.

Maps are 1–40 by 1–40. A cell is `empty`, `obstacle`, `spawnpoint`, or `problem`. A problem cell stores `problemNo` (1–999) and `type` (`math`, `oi`, `science`, `puzzle`). Tags are MO, OI, SCI, PUZ plus that index. Identity of a problem is `(type, index)`. The same index in another type is a different problem.

A problem is `{ index, type, prompt, answer, logic, difficulty }`. Difficulty is `easy` (1), `normal` (2), `hard` (3), or `insane` (4). Those points are the contest score. The grader’s 0–100 score is only pass or fail.

A contest has `startAt`, `durationMinutes`, `spawnMinutes`, and `readyMinutes`. Spawn time plus the wait must be shorter than the duration. Phases, from `contestPhase()`:

- `before` — until `startAt`
- `spawn` — until spawn time ends
- `ready` — the wait
- `live` — the solving period
- `ended`

Each phase shows a countdown (`phaseClock`).

`maps`, `problems`, and `contests` each have a revision. A full-list save sends that revision. A mismatch returns 409 and the admin UI opens a per-field diff instead of overwriting. Team changes bump the contests revision on their own.

## Rules that are easy to break

Painting: click or drag. A filled cell is cleared, not replaced. The exception is a single click (`strokeCount === 1`) with the Problem tool on an existing problem cell: that opens the problem. On a coarse pointer, a finger move past 10px scrolls instead of painting. Pinch zoom is on for coarse pointers and for viewports up to 1100px. The smallest zoom fits the whole grid. The largest shows about 6 by 6 cells.

Map paint and rename stay local until **Save changes**. Create and delete still save immediately. Leaving a dirty map asks first and restores `mapSnapshot`.

A new problem is stored only by **Save problem**, and only when both prompt and answer are non-empty after trim. Prompt, answer, difficulty, and logic stay in `problemDraft` until then. Index and type swaps on an existing problem confirm and persist immediately. Deleting a problem clears every map cell with that problem number and type.

Logic is optional JavaScript. Empty logic compares trim and case. A script sees `answer`, `expected`, and `result`. Score 100 accepts the cell. `result.comment` is what the student sees otherwise. The sandbox is `node:vm`, one second, no `require`, no files, no network. `test-problem` runs the same checker without saving. Students never receive the script.

Teams have 1 to 5 students. Usernames are resolved against real accounts, ignoring case, and a unique display name is accepted. A student is on at most one team in a contest. There cannot be more teams than spawn points.

During spawn, each member votes. The team choice exists only when every member has voted for the same cell. Teammates see each other’s votes. One member’s vote is the choice by itself. When every team has agreed, or when spawn time ends, the server assigns spawn points. A contested cell goes to one random team. Teams that never agreed get a free spawn if one remains.

Territory starts at the spawn. A problem can be solved only when it shares an edge with that team’s territory, the contest is live, and nobody else has claimed it. The first correct team keeps the cell. Own cells are dark with a dot. Other teams’ cells keep the difficulty color, a dark X, and that team’s color. Admins see team initials. The board freezes at the end time or when every problem is solved.

Student problem clicks open `answer.html` in a new tab. The in-page `#student-problem` markup can still exist, but that is not the contestant path.

Problem HTML is rendered in the parent page, then its scripts run, so a puzzle can fill `#student-answer`. Plain text without tags uses `textContent`. KaTeX accepts `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`. Do not give the admin preview the id `problem-preview`. The class is `problem-preview`.

Contest state polls about every 2 seconds while the mouse is moving and the tab is visible, every 15 seconds after 5 seconds of stillness, and every 60 seconds while the tab is hidden. The countdown still ticks every second. The poll is `POST { action: "contest-state" }`, not a GET.

## Working style

Confirm once for problem delete, index swap, bulk difficulty, and bulk delete. Confirm twice for map, contest, account, and team deletion. A type change that collides still confirms twice, then swaps types and flips map cells.

Do not send `logic` or `answer` to students. Do not wipe `teams`, `spawnVotes`, `spawnChoices`, `spawns`, or `claims` from a contest-schedule save. Changing the contest’s map clears cell assignments and keeps the teams.

`TERRITORY_API.md` is the contract. Update it when an action’s body or rule changes.
