# Resource Optimization Remediation — Scheduler Final (G7, G7a)

## Trigger
Unchanged: `.github/workflows/scheduled-jobs.yml` (every 15 min; `workflow_dispatch`) → `POST /api/platform/scheduler/run-due` (Bearer `CRON_SECRET`, jobs run in `after()`). **Operational dependency on GitHub Actions** — not inspectable here: whether `CRON_SECRET`/`DEPLOYMENT_URL` secrets exist, and GitHub's rule that scheduled workflows are disabled after 60 days of repo inactivity, are **unverified**. `vercel.json` is `{}` (no Vercel Cron; `vercel.cron.example.json` is inert).

**Added:** `SchedulerTriggerHeartbeat` (singleton). `run-due` records each trigger and its result; a gap > 45 min raises a deduped `scheduler_trigger_stale` platform alert at the next trigger and auto-resolves once cadence is normal. `GET /api/platform/scheduler/health` (Bearer `CRON_SECRET`, read-only, `no-store`) returns 200 when healthy and 503 when never-triggered / silent > 45 min / ≥ 3 consecutive failures — for an **independent uptime monitor** (the only way to alert when nothing is calling the scheduler at all).
**Second trigger:** not added in code. If wanted, point any external timer at `run-due`: both triggers use the same distributed locks, so they cannot double-run a job (tested). Recommended: an uptime monitor on `/health` (alerts) plus optionally a cron-job.org/cron call to `run-due` every 15 min offset from GitHub's.

## Behaviour changes
| Area | Before | Now |
|---|---|---|
| Failed job | `lastRunAt` advanced ⇒ next run after a full interval (daily job: ~24 h) | `consecutiveFailures`, `nextRetryAt` = `5 min·2^(n−1)` capped at the job's interval, bounded to 5 retries then back to normal cadence (failure alert stays up) |
| Staleness | measured from last *attempt* | measured from last *success* (`lastSuccessAt`; legacy rows fall back to `lastRunAt` if that run succeeded) |
| G7a stale alerts | `raiseStaleAlerts(preRunStatuses)` — a job that just recovered stayed "stale" | statuses re-read **after** any job ran; idle (nothing due) tick still costs one status query |
| Duplicate runs | lock stopped *overlapping* runs only | **found by test:** a second tick holding a pre-run snapshot re-ran a job right after the first released its lock. Fixed with double-checked locking (re-read dueness under the lock; manual runs bypass) |
| AI sweep | job + cron route had separate inline logic | one shared `runAiRuntimeSweep` |
| Time budget | hard-coded 240 s | `SCHEDULER_TIME_BUDGET_MS` (default 240 000, unchanged) |

All 13 registered jobs are still present and reachable through `run-due` (asserted by id).
**Function limit:** not determinable — no `maxDuration`/plan config exists in the repo (`vercel.json` is empty) and the deployed plan is not visible to me. I did not invent one. Remaining jobs simply run next tick if the budget is hit; set `SCHEDULER_TIME_BUDGET_MS` at/below the real limit.

## Tests
`tests/resourceOptimization/schedulerReliability.test.ts` (17): stale alert cleared by a successful run; genuinely stale job alerts once (deduped); failed+stale alerts raised and both cleared on recovery; idle tick = 1 read; retry backoff / cap / bounded / reset-on-success / stale-from-success; two simultaneous ticks run each job exactly once; 13-job registry; single AI sweep path; per-tenant dedupe-keyed sweep events (2 tenants, re-run 3×, no cross-tenant rows); heartbeat gap alert + resolve; health reasons; health endpoint 401/503/200 and executes nothing. Plus unchanged `tests/platform/scheduler.test.ts` (11) and the 192-test cron-secret contract suite.

## Not verified
The `after()` callback and real Vercel invocation lifecycle; per-tenant failure isolation *inside* each individual job handler (the 13 handlers were not audited one by one); GitHub secrets; alert delivery channels.
**Status: G7 INCOMPLETE** (trigger secrets/limits unverifiable; no second trigger configured) — **G7a PASS**.
