# ADR-0005: Database-backed jobs driven by cron

Status: Accepted · Date: 2026-11-06

## Decision
Use a `Job` table. A `jobs:tick` CLI, run by cron every 5–15 minutes, claims due jobs with
`FOR UPDATE SKIP LOCKED`, runs them within a time budget (e.g. 4 minutes), records a `JobRun`,
and exits. Jobs are idempotent and dedupe through `dedupeKey`. On a VPS the same handlers run in
a long-lived `jobs:work` loop.

## Consequences
+ Works on shared hosting with no Redis or worker process; jobs survive restarts.
− Latency of up to one cron interval for background work. Acceptable for scans, roll-ups and
  emails. Urgent emails such as verification or reset are sent inline, with the queue as fallback.
