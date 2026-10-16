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

Students receive each problem's prompt and type, and do not receive the answer. Admins receive the answer as well. The response includes `serverNow`, the server clock in milliseconds.

A contest has `startAt` (milliseconds since 1970, from the start time typed as `YYYY-MM-DD HH:MM:SS`), `durationMinutes`, `spawnMinutes`, and `readyMinutes`. Spawning starts at `startAt` and lasts `spawnMinutes`. The wait after that lasts `readyMinutes`. Both are part of `durationMinutes`. The contest itself is the time that remains. `spawns` lists `{ contestantId, cell }` for each chosen spawn point.

### `POST { "action": "save-maps", "maps": [...] }`

Admin only. Every map must be valid. If one map is invalid, nothing is saved. The replacement runs in one database transaction.

### `POST { "action": "save-problems", "problems": [...] }`

Admin only. Same rule: an invalid problem rejects the whole save.

### `POST { "action": "save-contests", "contests": [...] }`

Admin only. Updates contest names, maps, and schedules, and deletes contests that are no longer in the list. Contestant ids and spawn choices already stored are kept, so a save does not wipe a join or a spawn that just happened. Changing the map clears stored spawn choices. Spawn time and the wait must add up to less than the duration.

### `POST { "action": "join-contest", "contestId": "..." }`

Any signed-in user. Adds that user's username to the contest. Two joins at the same time both remain.

### `POST { "action": "remove-contestant", "contestId": "...", "contestantId": "..." }`

Admin only. Removes one contestant id and that contestant's spawn choice.

### `POST { "action": "choose-spawn", "contestId": "...", "cell": 0 }`

A joined contestant, only while spawning is open. `cell` is the index of a spawn-point cell on the contest map. Choosing again replaces that contestant's spawn point.

If the page cannot load this data, it does not save. Refresh and try again.
