# Scheduler (Hostinger cron) — setup and evidence

## Root cause: why the scheduler never ran

Hostinger's account cron list (`hosting_cron-jobs_list`, 13 Nov 2026) contained **no cron job for webcenta.com**. The only entry was a PHP job for another domain (`yonixhub.com`). The application's scheduler endpoint existed, but nothing ever called it, so for the whole life of the site:

* the import queue (`imports.run`) was never processed;
* security checks of imported apps and developer submissions (`submission.check`) never ran, so no import ever became eligible for publishing;
* email retries, push announcement batches after the first 100 devices, analytics roll-ups, visit counters, rankings, reminders and clean-up never ran.

A second problem: the documented command (`curl … -H "Authorization: Bearer <secret>"`) puts the secret in the cron command, where it is stored and shown in hPanel. Also, `node` is not on the cron shell's `PATH` on this server, so `npm run jobs:tick` cannot work there.

## What runs now

```
Hostinger cron (every 5 min)
  └─ /opt/alt/alt-nodejs22/root/usr/bin/node …/hbuilds/current/nodejs/cron-tick.mjs
       reads PUBLIC_ORIGIN and CRON_SECRET from the build's own .env.production (mode 0600)
       └─ POST https://webcenta.com/api/cron/tick   Authorization: Bearer <secret>
            └─ runTick(): scheduler lease → recover stale jobs → enqueue due recurring jobs
                          → claim jobs (FOR UPDATE SKIP LOCKED) → run → record each result → release lease
```

* **No secret in the command, in hPanel or in a URL.** `cron-tick.mjs` is copied next to `server.js` at build time (`scripts/prepare-standalone.mjs`) and reads the environment snapshot that every deployment already writes.
* **Authentication.** Only `POST` with `Authorization: Bearer <secret>` is accepted. The secret is the one in Admin → Settings → Scheduled tasks, or `CRON_SECRET`; both are accepted. A wrong or missing header gets 401 and a log line; `GET` gets 405. The comparison is constant-time.
* **Works without a browser or a running worker.** It goes through the public HTTPS address, which also wakes the app if Hostinger (Passenger) has idled it.
* **No overlapping runs.** A lease row (`SystemSetting "jobs.lock"`) is taken atomically with a conditional `UPDATE`. A second invocation while one is running records a *skipped* run and returns at once. The lease expires by itself (budget + 90 s), so a crashed run never blocks the scheduler.
* **Safe recovery.** Jobs left `RUNNING` for more than 10 minutes go back to `PENDING`. Each job is claimed with `FOR UPDATE SKIP LOCKED`, so even a taken-over lease never runs a job twice. Imports stuck in `IMPORTING` for 30 minutes are re-queued. A security check that crashes puts its revision back to `SUBMITTED` (previously it stayed in "automated checks" forever).
* **Logged.** Every invocation is a `JobRun` row: trigger (cron/admin/cli), start, finish, scheduled, processed, failed, skipped, error. Every job records start time, duration, result (e.g. `{"count": 4}`) or error, and attempts with exponential back-off. One line also goes to the Hostinger runtime log (`[webcenta] cron tick processed=…`).
* **Time zone.** Everything is UTC (database `UTC_TIMESTAMP`, ISO times in Admin → Scheduler).

## Schedules (by workload)

| Job | Every | What |
|---|---|---|
| email.deliver | 5 min | email retries |
| push.campaigns | 5 min | continue announcement batches (100 devices per batch) |
| imports.run | 10 min | import queue; the real pace is set in Settings → Automatic web app imports (default: 4 apps every 30 min) |
| stats.rollup | 15 min | daily views/visits, visit counters |
| monitor.enqueue | 15 min | queue due security re-checks |
| imports.dedupe | 60 min | skip queued duplicates |
| imports.enrich | 60 min | description enrichment (4 listings per run) |
| ranking.recompute | 60 min | trending/popularity |
| maintenance.purge-expired | 60 min | sessions, rate limits, job history |
| notify.reminders | 6 h | inactivity reminders |
| purge-raw-events, users.purge-deleted, purge-history | daily | retention |

Event jobs (`submission.check`, `scan.listing`, `notify.new-app`, `notify.app-updated`, `indexnow.ping`) are queued when something happens and run on the next tick.

## Admin → Scheduler

`admin.webcenta.com/jobs` shows, for every job: name, enabled/paused, schedule, last execution, next expected run, last result, duration, failures in the last 7 days, the error, and **Run now** / **Pause** / **Resume**. *Run now* runs the real handler through the same job record and shows its actual outcome. *Run the scheduler now* runs a full tick through the same code path as the cron job. Failed jobs can be retried. A red banner appears when the hosting cron has not called for 15 minutes.

## The Hostinger cron entry

Created through the Hostinger API on deployment day (see test-results.md for the output). To create or check it by hand: **hPanel → Websites → webcenta.com → Advanced → Cron Jobs → Custom**.

* **Command** (no secret in it):

```bash
/opt/alt/alt-nodejs22/root/usr/bin/node /home/u658485007/domains/webcenta.com/hbuilds/current/nodejs/cron-tick.mjs
```

* **Schedule:** every 5 minutes (`*/5 * * * *`).

`hbuilds/current` always points to the live deployment, so the command keeps working after every redeploy. The output of the last run (one line such as `… webcenta cron: HTTP 200 run …: processed 3, failed 0, enqueued 2, recovered 0, 840 ms`) is shown under *View output* in hPanel.

If you change the cron secret in Admin → Settings → Scheduled tasks, either keep the `CRON_SECRET` environment variable (it stays accepted) or update it in hPanel and redeploy.
