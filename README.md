# Territory-Game

Puzzle Territory is a Wah Yan College maths-team contest. Teams claim cells on a shared map by solving problems.

## Local development

```bash
npm install
npm run dev
```

The dev server loads `.env`, serves the project root, and runs `api/*.js` the way Vercel does. It needs `MONGODB_URI` and `JWT_SECRET`. Node 20+.

The browser bundle `script.js` is generated from the numbered files in `scripts/`. After changing those files run:

```bash
npm run build:scripts
```

The split admin pages under `/admin/` use the ES modules in `/app/` and `/shared/` directly.

## Database backups

The full database is copied to a private GitHub repository every day at **02:00 Asia/Hong_Kong**. Vercel Cron runs in UTC, so the schedule in `vercel.json` is `0 18 * * *`.

Open `/admin/backups.html` to see the live database and the backup tree. The page can:

- create a full backup immediately;
- show each snapshot, its branch, parent, and collection counts;
- restore the whole database after entering the `DSCONFIRM` value.

Restoring always creates a safety snapshot of the current database **before** changing anything. It then restores the selected snapshot, writes an after-restore snapshot, and starts a new logical branch from the restored node. The old branch stays in the tree.

### Required environment variables

| Variable | Purpose |
| --- | --- |
| `CRON_SECRET` | Vercel Cron sends this as `Authorization: Bearer <CRON_SECRET>`. |
| `GITHUB_BACKUP_TOKEN` | Fine-grained token with **Contents: read and write** on the backup repository. |
| `GITHUB_BACKUP_OWNER` | User or organization that owns the backup repository. |
| `GITHUB_BACKUP_REPO` | Backup repository name. Defaults to `backup`. |
| `GITHUB_BACKUP_BRANCH` | Branch used for the snapshots. Defaults to `main`. |
| `DSCONFIRM` | Exact confirmation code required to restore. The value is never sent to the browser. |

The fallback names `GITHUB_IMAGES_*`, `GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_TOKEN` from the reference uploader are also accepted. An empty repository is initialized with a README and the configured branch on first use.

Backups are stored as:

```text
database/_state.json                 current head and logical branch
database/_lock.json                  prevents two backup/restore operations at once
database/<timestamp>/_started.json   marks a new backup as in progress
database/<timestamp>/_manifest.json  metadata, written last
database/<timestamp>/<collection>.json
```

Collection files use MongoDB Extended JSON, so `ObjectId` and `Date` values survive a restore. A directory with `_started.json` but no `_manifest.json` is shown as incomplete and cannot be restored. Directories from the reference uploader that have neither file are shown as legacy snapshots and can still be restored.

### Notes

- The backup repository should be private. The token is only used by serverless functions.
- A restore can replace the `users` collection. If the signed-in admin is not in the restored snapshot, that admin is signed out on the next request. The restore endpoint refuses a snapshot that has no usable admin/root account.
- Snapshots contain documents. MongoDB collection indexes and validators are not included.
- The backup code is in `lib/github-backup.js`, `api/backup.js`, and `api/cron.js`.
