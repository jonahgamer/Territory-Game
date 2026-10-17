# Territory Game API

`/api/login` and `/api/territory` share one MongoDB database, `territory_game` unless `MONGODB_DB` is set. The database must be a replica set so a save can roll back if it fails.

## POST `/api/login`

Body: `{ "username": "...", "password": "..." }`

Success: `{ "success": true, "token": "...", "user": { "username", "displayName", "role", "pfp" } }`

`role` is `admin` or `student`. A suspended account gets the same message as a wrong password. More than 20 attempts from one address in 5 minutes returns 429. The limit is stored in the database, so it still applies when more than one server is running.

## `/api/territory`

Every request needs `Authorization: Bearer <token>`.

### `GET ?action=bootstrap`

Returns the signed-in user, maps, problems, and contests.

Students receive each problem's prompt, type, and difficulty, and do not receive the answer or the logic. Admins receive the answer and the optional `logic` script as well. Difficulty is `easy`, `normal`, `hard`, or `insane`. The response includes `serverNow`, the server clock in milliseconds.

A contest has `startAt` (milliseconds since 1970), `durationMinutes`, `spawnMinutes`, and `readyMinutes`. Spawning starts at `startAt` and lasts `spawnMinutes`. The wait after that lasts `readyMinutes`. Both are part of `durationMinutes`. `teams` lists `{ id, name, members }` with 1 to 5 usernames. `spawnVotes` lists each student's pick `{ teamId, username, cell }`. `spawnChoices` lists a cell only after every member of that team has picked it. When every team has agreed, or when spawn time ends, the server assigns one spawn point per team and sets `spawnResolved`. If several teams agreed on the same cell, one random team keeps it and the others move to free spawn points. Teams that have not agreed are placed on free spawn points too. `spawns` then lists `{ teamId, cell }`. `claims` lists solved cells `{ cell, teamId, solvedBy, solvedAt }`. Before spawn points are assigned, a student only receives their own team's votes and choice.

### `POST { "action": "save-maps", "maps": [...] }`

Admin only. Every map must be valid. If one map is invalid, nothing is saved. The replacement runs in one database transaction.

### `POST { "action": "save-problems", "problems": [...] }`

Admin only. Same rule: an invalid problem rejects the whole save.

### `POST { "action": "save-contests", "contests": [...] }`

Admin only. Updates contest names, maps, and schedules, and deletes contests that are no longer in the list. Teams, spawn choices, assigned spawns, and solved cells already stored are kept. Changing the map clears those cell assignments. Spawn time and the wait must add up to less than the duration.

### `POST { "action": "save-team", "contestId": "...", "name": "...", "members": ["..."] }`

Admin only. Creates a team of 1 to 5 different student usernames. A student can be on only one team in that contest.

### `POST { "action": "remove-team", "contestId": "...", "teamId": "..." }`

Admin only. Removes the team, its spawn choice, its assigned spawn, and the cells it solved.

### `POST { "action": "choose-spawn", "contestId": "...", "cell": 0 }`

A student on a team, only while spawning is open and spawn points are not assigned yet. `cell` is a spawn-point cell. The pick is that student's vote. The team choice is stored when every member has voted for the same cell. A student can change their vote until then. When every team has agreed, spawn points are assigned immediately.

### `POST { "action": "solve", "contestId": "...", "cell": 0, "answer": "..." }`

A student on a team, only while the contest is running, the cell is an unsolved problem, and it touches the team's spawn or a cell the team has solved. If the problem has logic, that JavaScript runs in a short-lived sandbox with `answer` and `expected`. It can return true or false, a score, or `{ score, comment }`, or set `result.score` and `result.comment`. A score of 100 accepts the answer, and the comment is shown when it does not. Otherwise the answer must match, ignoring capital letters and surrounding spaces. Easy scores 1, normal 2, hard 3, and insane 4. The first correct team keeps the cell.

### `POST { "action": "contest-state", "contestId": "..." }`

Returns the team's view of teams, spawn choices, assigned spawns, solved cells, and the leaderboard. An admin can read any contest. If spawn time has ended, this assigns any spawn points that are still open.

### `GET ?action=list-accounts`

Admin only. Returns `{ username, displayName, role, banned }` for each account. Passwords are not included. `role` is `admin` or `student`.

### `POST { "action": "create-account", "username": "...", "displayName": "...", "password": "..." }`

Admin only. Creates a student. The username can use letters, numbers, dots, dashes, and underscores. The password must be 4 to 256 characters.

### `POST { "action": "update-account", "username": "...", "displayName": "...", "password": "...", "banned": false }`

Admin only. Changes a student's display name, password, or suspended state. Any of those fields can be left out. Admin accounts cannot be changed here.

### `POST { "action": "delete-account", "username": "..." }`

Admin only. Deletes a student account. An admin cannot delete their own account or another admin.

If the page cannot load this data, it does not save. Refresh and try again.
