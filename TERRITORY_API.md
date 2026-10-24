# Territory Game API

`/api/login` and `/api/territory` share one MongoDB database, `territory_game` unless `MONGODB_DB` is set. The database must be a replica set so a save can roll back if it fails.

## Pages and URLs

The main app at `/index.html` uses hash routes, so every screen has its own URL and the browser Back and Forward buttons work. The same URL can be opened directly or shared.

| URL | Page |
| --- | --- |
| `#/home` | Home |
| `#/maps` | Map list |
| `#/maps/<mapId>` | Map editor |
| `#/maps/<mapId>/problem/<type>/<index>` | Problem editor opened from a map |
| `#/problems` | Problem type chooser |
| `#/problems/<type>` | Problems of one type |
| `#/problems/<type>/<index>` | Problem editor opened from the problem list |
| `#/contests` | Contest list (admin) |
| `#/contests/<contestId>` | Contest setup, teams, and leaderboard (admin) |
| `#/student` | Contests for the signed-in student |
| `#/student/<contestId>` | The student's game board |
| `#/settings` | Account management (admin) |
| `#/tutorial` | Logic tutorial (admin) |

Admin pages also live at normal URLs, including `/admin/maps.html`, `/admin/problems.html`,
`/admin/contests.html`, `/admin/accounts.html`, and `/admin/backups.html`.

`<type>` is `math`, `oi`, `science`, or `puzzle`. When no hash is present an admin opens `#/maps` and a student opens `#/student`. A student who opens an admin URL is moved to the student view. The split pages under `/ui2/` keep their own normal URLs.

`/login.html` signs a user in. `/answer.html?contest=<contestId>&cell=<cellIndex>` opens one problem in its own tab and submits the answer to the same contest.

## POST `/api/login`

Body: `{ "username": "...", "password": "..." }`

Success: `{ "success": true, "token": "...", "user": { "username", "displayName", "role", "pfp" } }`

`role` is `root`, `admin`, or `student`. Root and admin can both run the admin pages. A suspended account gets the same message as a wrong password. More than 20 attempts from one address in 5 minutes returns 429. The limit is stored in the database, so it still applies when more than one server is running.

## `/api/territory`

Every request needs `Authorization: Bearer <token>`.

### `GET ?action=bootstrap`

The old single-page bundle still uses this. The split pages do not. Each of those pages calls one `page-*` action and receives only the records that page shows.

| Action | Page | Returns |
| --- | --- | --- |
| `page-maps` | Map list | Every map, without the photo file |
| `page-map&map=` | Map editor and difficulty view | That map, plus problem index, type, difficulty, and score |
| `page-problems` | Problem list | Every problem, plus how many cells use each one |
| `page-problem&type=&index=` | Problem editor | That problem, the other problem keys, and its cell count |
| `page-problem-keys` | Batch add | Problem keys only |
| `page-problem-text` | Export text | Prompts for the requested problems |
| `page-contests` | Contest list | Contest summaries and map names, not cells |
| `page-contest&id=` | One contest | That contest, its maps, and the scores of problems on those maps |
| `page-play&contest=` | Contestant board | That contest, its maps, and the score of each problem on those maps. The prompt comes from `page-answer` |
| `page-student-contests` | Contestant list | The signed-in student's contests and map names |
| `page-answer&contest=&map=&cell=` | Answer tab | That problem's prompt and the contest clock and energy |
| `page-credits` | Credits | Version notes |

`save-map`, `delete-map`, `save-problem`, `add-problems`, `delete-problems`, `move-problem`, `save-contest`, and `delete-contest` write one record, or the listed problems, and leave the rest of the collection in place. `delete-problems` and `move-problem` also update the map cells that use those problems. A stale `revision` is still a 409.

`bootstrap` returns the signed-in user, maps, problems, and contests.

Students receive only the contests they are on, the maps for those contests, and the prompts of problems placed on those maps. They receive each problem's prompt, type, difficulty, and `score`, and do not receive the answer, the solution, or the logic. Admins receive every map, problem, answer, optional `solution`, `score`, and optional `logic` script. `score` is the contest points for a correct answer, a whole number from 0 to 999. A missing `score` uses the difficulty default: easy 1, normal 2, hard 3, insane 4. Everyone receives `versions`, the Credits notes, as plain text. Difficulty is `easy`, `normal`, `hard`, or `insane`. The response includes `serverNow`, the server clock in milliseconds, and `revisions` with the current `maps`, `problems`, and `contests` revision numbers. Send a saved revision back with the next full-list save; a stale revision is rejected instead of overwriting newer work.

On a 409, the admin UI fetches this response again and opens a field-level diff instead of asking for a page refresh. Each added, deleted, or changed record can keep the local value, the server value, or a per-field mix. Applying the choices saves with the latest server revision.

A contest lists `mapIds`. `mapId` is the first of those. `teleports` lists `{ id, label, a: { mapId, cell }, b: { mapId, cell } }`. A pair can use two cells on one map or one cell on each of two maps. The cells themselves stay `{ kind: "teleport" }` on the map, with no pair stored there. During the live phase, a team with territory next to one end can claim it. Both ends become that team's territory, and neither end adds score or spends energy. The label is shown on both ends in the contest. A contest is `competition` or `testing`. A competition shares its maps, so the first correct team keeps a cell. A testing contest gives every team its own copy of that map: teams can be added without sharing spawn points, and a cell solved by one team stays open for the others. Spawning starts at `startAt` and lasts `spawnMinutes`. The wait after that lasts `readyMinutes`. Both are part of `durationMinutes`. `teams` lists `{ id, name, members }` with 1 to 5 usernames. `spawnVotes` lists each student's pick `{ teamId, username, cell }`. `spawnChoices` lists a cell only after every member of that team has picked it. `spawnMode` is `choose` or `random`. Choose keeps the spawn period: when every team has agreed, or when spawn time ends, the server assigns one spawn point per team and sets `spawnResolved`. Random sets spawn time to 0, so there is no choosing period. At the start time the server places every team on a random free spawn point, then the wait still runs before solving begins. If several teams agreed on the same cell, one random team keeps it and the others move to free spawn points. Teams that have not agreed are placed on free spawn points too. `spawns` then lists `{ teamId, cell }`. `claims` lists solved cells `{ cell, teamId, solvedBy, solvedAt }`. Before spawn points are assigned, a student only receives their own team's votes and choice.

Each team has one energy pool, maximum 100. It starts full when solving begins. During the live phase it gains `energyRegen` every `energyRegenSeconds`. The restore clock keeps its phase when energy is spent; an attempt does not start that interval over. `energyAttemptCost` is spent on every judged attempt, including a correct answer that loses the cell to another team. A correct answer also adds the matching amount from `energySolve` (`easy`, `normal`, `hard`, `insane`) when the energy before the attempt is below `energySolveBelow`. An attempt below `energyAttemptMin` is refused and spends nothing. `energy` lists `{ teamId, value, at }` after the last change. `at` is the time through which restore has already been applied. A student receives only their team's entry. Changing the map, contest mode, or spawn mode clears it. Missing settings use restore 5 every 30 seconds, 10 spent per attempt, attempts blocked below 10, and solve restore of 8, 12, 18, and 25 while energy is below 50.

### `POST { "action": "save-maps", "maps": [...] }`

Admin only. Every map must be valid. If one map is invalid, nothing is saved. Body may include `revision` from `bootstrap`. The save runs in one database transaction, upserts the maps sent, and removes only maps that are no longer in the list. If `revision` does not match the current revision, the request returns 409 and nothing changes.

A map’s `backdrop` is `terrain` or `photo`. Photo mode stores `photo` as a `data:image/jpeg`, `png`, or `webp` base64 URL no longer than 700000 characters. Terrain mode stores an empty `photo`. Contestants receive the same backdrop so the board can draw the picture. The picture is scaled to cover the grid.

### `POST { "action": "save-problems", "problems": [...] }`

Admin only. Same rule: an invalid problem rejects the whole save. Body may include `revision`; a stale revision returns 409. Problems are identified by `type` and `index`, so the save is incremental in the same way as maps.

### `POST { "action": "test-problem", "logic": "...", "expected": "...", "answer": "..." }`

Admin only. Runs the submitted answer against the current problem fields without saving anything. `logic` is the checker source; `expected` is the problem answer; `answer` is the simulated student answer. If `logic` is empty, the server compares `expected` and `answer` as text.

The response contains `correct`, `systemError`, `score`, `comment`, and `error`. A checker exception or timeout sets `systemError` and returns the reason in `error`; otherwise `correct` is the AC/WA result. The endpoint uses the same sandbox, one-second timeout, and score interpretation as a real solve.

### `POST { "action": "save-contests", "contests": [...] }`

Admin only. Updates contest names, maps, and schedules, and deletes contests that are no longer in the list. Teams, spawn choices, assigned spawns, and solved cells already stored are kept. Changing the map clears those cell assignments. Spawn time and the wait must add up to less than the duration. Body may include `revision`; a stale revision returns 409. The response includes the new `revision`.

A contest map should have at least as many spawn points as teams. If a map is changed to one with fewer spawn points than the existing teams, the extra teams are kept but may not receive a spawn point.

### `POST { "action": "save-team", "contestId": "...", "name": "...", "members": ["..."] }`

Admin only. Creates a team of 1 to 5 different student usernames. Every username must belong to an existing, non-suspended student account. A student can be on only one team in that contest.

The contest map must have at least one spawn point, and the contest cannot have more teams than spawn points. These two rules keep every team able to start.

Pass an existing `teamId` to edit that team instead of creating one. Editing replaces the name and member list, removes the spawn votes of members who left, and recalculates the team's spawn agreement. A team name must be unique in the contest, ignoring capital letters. `memberA` and `memberB` are still accepted as an alternative to `members` for older clients. Team changes bump the `contests` revision, and the response includes the new `revision`.

### `POST { "action": "remove-team", "contestId": "...", "teamId": "..." }`

Admin only. Removes the team, its spawn choice, its assigned spawn, and the cells it solved. Removing the last team clears `spawnResolved` so a replacement team can start the spawn phase again. Team changes bump the `contests` revision, and the response includes the new `revision`.

### `POST { "action": "choose-spawn", "contestId": "...", "cell": 0 }`

A student on a team, only while spawning is open and spawn points are not assigned yet. `cell` is a spawn-point cell. The pick is that student's vote. The team choice is stored only when every member has voted for the same cell. A student can change their vote until then. When every team has agreed, spawn points are assigned immediately. At the end of spawn time, the server assigns any remaining teams to free spawn points.

### `POST { "action": "claim-teleport", "contestId": "...", "mapId": "...", "cell": 0 }`

A student on a team, during the live phase, when the cell is one end of a teleport pair on a contest map and the team's territory shares an edge with it. Both ends must be free. The team claims both cells. This does not spend energy and does not add score.

### `POST { "action": "solve", "contestId": "...", "mapId": "...", "cell": 0, "answer": "..." }`

A student on a team, only while the contest is running, the cell is an unsolved problem, and it touches the team's spawn or a cell the team has solved. If the problem has logic, that JavaScript runs in a short-lived sandbox with `answer` and `expected`. It can return true or false, a score, or `{ score, comment }`, or set `result.score` and `result.comment`. A score of 100 accepts the answer, and the comment is shown when it does not. Otherwise the answer must match, ignoring capital letters and surrounding spaces. A correct answer adds that problem's `score` to the team. The first correct team keeps the cell. A judged attempt still spends energy when the answer is wrong, and also when the answer is right but another team takes the cell first. Those responses include the updated contest. A team below `energyAttemptMin` cannot attempt.

### `POST { "action": "contest-state", "contestId": "..." }`

Returns the team's view of teams, spawn choices, assigned spawns, solved cells, energy, and the leaderboard. An admin can read any contest. If spawn time has ended, this assigns any spawn points that are still open.

The leaderboard lists `{ teamId, name, score, solved, territory }`. `score` is the sum of the `score` of each problem the team solved, `solved` is the number of problems the team claimed, and `territory` counts the team's spawn point plus every cell it solved. Ties are sorted by score, then by solved count, then by team name. `frozen` is true after the contest ends or after every problem has been solved.

### `GET ?action=list-accounts`

Admin only. Returns one entry for each account:

```json
{
  "username": "alice",
  "displayName": "Alice",
  "role": "student",
  "banned": false,
  "pfp": "",
  "createdAt": 1730000000000,
  "lastLoginAt": 1730000000000,
  "teams": [
    { "contestId": "...", "contestName": "Spring Contest", "teamId": "...", "teamName": "Alpha" }
  ]
}
```

Passwords are not included. `role` is `root`, `admin`, or `student`. `createdAt` and `lastLoginAt` are milliseconds since 1970, or `null` when unknown. `teams` is every contest team that currently contains the account.

### `POST { "action": "create-account", "username": "...", "displayName": "...", "password": "...", "role": "student" }`

Admin only. Creates a student. Root can pass `"role": "admin"` to create an admin. The username `root` is reserved. The username can use letters, numbers, dots, dashes, and underscores. The password must be 4 to 256 characters.

### `POST { "action": "update-account", "username": "...", "displayName": "...", "password": "...", "banned": false }`

Admin only. Changes a student's display name, password, or suspended state. Any of those fields can be left out. Root can change an admin the same way. The root account cannot be changed here, and an admin cannot change another admin.

Setting `banned` to `true` also removes the student from every contest team, so the rest of the team is not blocked by a student who can no longer sign in. Their old spawn vote is removed and a team that becomes empty is deleted. The suspended account's next API request returns 401 even if it still has a valid token. Restoring an account does not put the student back on a team; add them again from the contest page.

### `POST { "action": "delete-account", "username": "..." }`

Admin only. Deletes a student account and removes that username from every contest team in the same transaction. Root can also delete an admin. Nobody can delete the root account, and an account cannot delete itself.

### `POST { "action": "add-version", "version": "...", "message": "..." }`

Admin only. Adds a Credits note. `version` is at most 40 characters and `message` is at most 4000. The text is stored and shown as plain text, with the username of the admin who posted it. The response includes the newest notes first.

### `POST { "action": "delete-version", "id": "..." }`

Admin only. Deletes one Credits note by its `id`. The response includes the remaining notes, newest first.

## `/api/backup`

Admin only. Every request needs `Authorization: Bearer <token>`. Responses are
`Cache-Control: no-store`. An empty backup repository is initialized with a
README and the configured branch on first access.

### `GET ?action=tree`

Returns the live database counts, the current backup head, and every snapshot
in the backup repository:

```json
{
  "success": true,
  "configured": true,
  "restoreConfigured": true,
  "secretConfigured": true,
  "current": { "collections": { "users": 12 }, "totalCollections": 1, "totalDocs": 12 },
  "state": { "head": "2026-10-18T18-00-00-000Z", "branch": "main" },
  "lock": { "exists": false, "active": false, "expired": false },
  "backups": [
    {
      "id": "2026-10-18T18-00-00-000Z",
      "kind": "scheduled",
      "parent": "2026-10-17T18-00-00-000Z",
      "branch": "main",
      "collectionCount": 7,
      "totalDocs": 120,
      "restorable": true
    }
  ]
}
```

`kind` is `scheduled`, `manual`, `pre-restore`, `after-restore`, `legacy`, or
`incomplete`. A snapshot with `_started.json` but no `_manifest.json`, with a
missing collection file, or with a count mismatch is not restorable. Directories
with neither file (from the reference uploader's cron) are shown as legacy
snapshots and remain restorable. `backupError` is present when the GitHub
repository cannot be read. `lock` describes `database/_lock.json`; an active
lock blocks a new manual backup or restore.

### `POST { "action": "backup-now", "confirm": "..." }`

Manual backup requires `confirm` to equal the server environment variable
`DSCONFIRM` exactly. If `DSCONFIRM` is missing, backup returns 503. The scheduled
cron backup uses `CRON_SECRET` instead.

Creates a full snapshot on the current branch and moves the backup head to it.
The response includes the new backup and a fresh `tree`. A second backup or
restore cannot run at the same time: the server uses `database/_lock.json`.
The lock is released before the response tree is built; a stale lock can be
cleared with `unlock`.

### `POST { "action": "unlock", "confirm": "..." }`

Requires the same `DSCONFIRM` value. Deletes `database/_lock.json`. If the token
can update but not delete that file, it writes an already-expired lock instead.
Returns a fresh `tree`.

### `POST { "action": "restore", "backupId": "...", "confirm": "..." }`

Requires `confirm` to equal the server environment variable `DSCONFIRM`
exactly. If `DSCONFIRM` is missing, restore returns 503.

The order is enforced on the server:

1. Validate the selected snapshot completely. A snapshot without a `users`
   collection, or with no usable admin/root account, is refused so a partial
   backup cannot wipe every account or lock every admin out.
2. Create a `pre-restore` snapshot of the current database and read it back
   through the same restore parser. If either step fails, the restore is
   aborted before the first write.
3. Replace the live collections with the selected snapshot. Collections that
   did not exist in the snapshot are dropped.
4. Create an `after-restore` snapshot on a new logical branch whose parent is
   the restored snapshot.
5. Set the backup head to the new branch.

The response includes `safetyBackup`, `afterRestoreBackup`, `branch`,
`collectionsRestored`, `collectionsDropped`, and a fresh `tree`. If step 3
fails after the safety snapshot was written, the response includes the safety
backup id so it can be restored again.

Snapshots use MongoDB Extended JSON. `ObjectId` and `Date` values are restored
with their original types.

### `GET /api/cron`

Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>` once a day.
The schedule `0 18 * * *` is 02:00 Asia/Hong_Kong. It performs the same full
snapshot as `backup-now`, with `kind: "scheduled"` and `by: "cron"`.

## Team and territory rules

- A team has 1 to 5 students and shares one spawn point, one territory, and one score.
- A contest cannot have more teams than its map has spawn points. Add spawn points before adding teams.
- A team's spawn choice exists only when every member picks the same cell. Teammates can see each other's votes, and can change them until agreement.
- Spawn points are assigned as soon as every team agrees, or when spawn time ends. A contested cell goes to one random team; the others move to free spawn points.
- Territory starts at the team's spawn point. A team can solve a problem cell that shares an edge with its territory.
- The first team with a correct answer keeps the cell. A claimed cell cannot be claimed again.
- The board freezes when the contest ends or when every problem cell has been solved.

If the page cannot load this data, it does not save. Refresh and try again.
