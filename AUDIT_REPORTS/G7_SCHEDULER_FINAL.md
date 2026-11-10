# G7 — Scheduler Reliability (Final)

**Status: PASS for the trigger, auth and recovery mechanics (evidence below). INCOMPLETE for Vercel function-duration limit (cannot be determined from the repo or from authorized access).**

## Evidence gathered (read-only; no secret values read or printed)
| Item | Result |
|---|---|
| GitHub workflow `.github/workflows/scheduled-jobs.yml` | cron `7,22,37,52 * * * *`, `workflow_dispatch`, concurrency group, 10-min timeout, 3 attempts × 2 hosts, fails loudly on missing/rejected secret |
| Repository Actions secrets (names only via `gh secret list`) | `CRON_SECRET` and `DEPLOYMENT_URL` **exist** (created 2026-09-13) |
| Actual trigger history (`gh run list`, last 100 scheduled runs, 25.5 h) | **99 success / 1 failure**; run gaps median **15 min**, p90 **22 min**, max **39 min**. A success means the deployed endpoint returned 200 with the configured secret, so deployment URL and `CRON_SECRET` match production |
| `CRON_SECRET` validation | route returns 401 without/with wrong Bearer, and fails closed when the env is unset (tests + 192-test cron-secret contract suite + runtime) |
| Health endpoint | built and middleware-reachable (bug fixed earlier); runtime: `healthy:true`, `ageMs` ≈ 8 s after a trigger |
| Heartbeat / stale-trigger alert | gap > 45 min raises a deduped alert; **observed max GitHub gap is 39 min, so the threshold has only ~6 min margin**: GitHub cron jitter could produce false alerts |
| Job locks, lock expiry, double-checked locking, retry backoff, post-run stale recovery | covered by `schedulerReliability.test.ts` (17 tests) |
| 13 registered jobs | runtime: `run-due` created 13 `SchedulerJobRun` records; registry test asserts all 13 by id |
| Failure isolation between jobs | each job runs in its own try/catch in the runner; failure of one does not stop the rest (tests) |
| Vercel function execution limit | **NOT VERIFIED.** `vercel.json` is `{}`, `run-due` declares no `maxDuration`, and `run-due` does its work in `after()`, which is bounded by the function limit. The runner budget (`SCHEDULER_TIME_BUDGET_MS`, default 240 s) assumes a limit ≥ 240 s. Whether the project's plan/Fluid setting allows that was not checkable. I did **not** add `maxDuration` because an unsupported value fails deployment |
| Production job completion | **NOT VERIFIED**: the GitHub run only proves the 200 response (≈10 s), not that jobs finish. No production health call was made (needs the secret; production access not authorized) |

## Is a second trigger necessary?
Not as a code change. The GitHub trigger has been reliable (99/100), and the system already detects a silent trigger via the heartbeat gap alert and the 503 health endpoint. What is missing is an **independent observer**: if GitHub disables the schedule (60 days of repo inactivity) no code in the app can alert, because nothing runs. **Recommended recovery mechanism (documented, not configured by me):** an uptime monitor on `GET /api/platform/scheduler/health` (Bearer `CRON_SECRET`) with alerting on non-200, and optionally a cron-job.org call to `run-due` offset from GitHub's; both triggers share the same distributed locks, so they cannot double-run a job (tested). Also raise the stale threshold to ≥ 60 min to remove the false-alert margin problem.

## Doc drift found
The workflow header comment says "12 registered jobs"; the registry has 13. Not changed (comment only).
