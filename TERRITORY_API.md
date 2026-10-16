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

Students receive each problem's prompt and type, and do not receive the answer. Admins receive the answer as well.

### `POST { "action": "save-maps", "maps": [...] }`

Admin only. Every map must be valid. If one map is invalid, nothing is saved. The replacement runs in one database transaction.

### `POST { "action": "save-problems", "problems": [...] }`

Admin only. Same rule: an invalid problem rejects the whole save.

### `POST { "action": "save-contests", "contests": [...] }`

Admin only. Updates contest names and maps, and deletes contests that are no longer in the list. Contestant ids already stored are kept, so a save does not wipe a join that just happened.

### `POST { "action": "join-contest", "contestId": "..." }`

Any signed-in user. Adds that user's username to the contest. Two joins at the same time both remain.

### `POST { "action": "remove-contestant", "contestId": "...", "contestantId": "..." }`

Admin only. Removes one contestant id.

If the page cannot load this data, it does not save. Refresh and try again.
