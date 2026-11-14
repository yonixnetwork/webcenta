# Backups and restoration

## What exists

1. **Hostinger backups** (hPanel → Websites → webcenta.com → **Files → Backups**). This is the plan's automatic backups of files and databases; the page shows the available dates and retention for your plan. *Check it once now* so you know the latest restore point.
2. **On-demand logical backup:** `scripts/backup.sh` writes a gzip-compressed SQL dump (consistent InnoDB snapshot, no locks):
   ```bash
   DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/DATABASE' bash scripts/backup.sh ./backups
   ```
   Run it from a trusted computer with temporary Remote MySQL access (hPanel → Databases → Remote MySQL; remove the access afterwards). Alternatively use phpMyAdmin → Export (SQL).
3. **Restore drill:** `scripts/restore-drill.sh` restores a dump into a scratch database and verifies it (run in CI on every push, so the procedure is known to work).

Recommended retention: keep Hostinger's automatic backups, plus a manual dump before every risky change (bulk actions, migrations, credential changes), stored encrypted off the server for 30 days.

## Restoring the database

1. **Take a backup of the current state first** (even if damaged).
2. Create an empty database in hPanel → Databases (e.g. `…_restore`).
3. Restore into it:
   * **Hostinger backup:** hPanel → Backups → Databases → choose the date → *Restore* into the new database (or download and import with phpMyAdmin).
   * **Dump file:** `gunzip -c webcenta-YYYYMMDD.sql.gz | mysql -h HOST -u USER -p NEWDATABASE`, or phpMyAdmin → Import.
4. Check it: run `SOURCE_URL=… SCRATCH_URL=… bash scripts/restore-drill.sh file.sql.gz` locally, or browse key tables (Listing, User, AdminUser) in phpMyAdmin.
5. Switch: set `DATABASE_URL` in hPanel to the restored database and redeploy. On start the app applies any newer migrations automatically ("auto-migrate" in the runtime log).
6. Verify: the site loads, an admin can sign in, Admin → Scheduler shows the cron running.

## Restoring files

The app itself is rebuilt from GitHub on every deploy; no file restore is needed for code. Uploaded media lives under `STORAGE_LOCAL_DIR` (outside `public_html`). Restore that folder from the Hostinger file backup if media was lost.

## Encryption key

Settings secrets and admin authenticator seeds are encrypted with `FIELD_ENCRYPTION_KEY`. A database backup is only fully usable with the key that was active when it was taken. **Store a copy of the key securely offline** (password manager), separately from database backups.
