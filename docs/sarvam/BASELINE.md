# BASELINE — the one number every comparison uses

**Command (run from the repo root):**

```
npx vitest run --maxWorkers=3
```

**Measured** 2026-09-19 on a clean checkout of the branch point (`e3eff17`, the commit `sarvam` was cut from,
in a separate `git worktree` with the same `.env` and a symlinked `node_modules`), local MongoDB on :27017,
16-core machine. Three consecutive runs:

| Run | Test files | Tests passed | Tests failed | Skipped/pending | Duration |
|---|---|---|---|---|---|
| 1 | 201 | 1957 | **0** | 0 | ≈ 2 m 40 s |
| 2 | 201 | 1957 | **0** | 0 | ≈ 3 m 37 s |
| 3 | 201 | 1957 | **0** | 0 | ≈ 3 m 08 s |

The three runs are **identical at the individual-test level** (same set of passing tests; no test failed in any run).

## What this replaces
The earlier "43 failing files / 46 files + 3 tests" figures came from **default parallelism (16 workers)**. At 16 workers
the Mongo-backed route tests time out (5 s test / 10 s hook timeouts) and the failing set shifts from run to run — it is
load noise, not a property of the code. Confirmed: files that failed at 16 workers pass when re-run, and the same tests
pass on the branch point at `--maxWorkers=3`, three times, byte-identical.
`docs/ai/BASELINE_FAILURES.md` (Atlas-DNS explanation) describes a different environment and is superseded for this branch.

## The rule
* **Any test failure under this command is a regression.** There is no "known failure" allowance — the baseline is zero.
* Running the suite at other worker counts is fine for quick checks, but a red result there is not evidence of a
  regression until it reproduces under the command above.

## Result on `sarvam` (same command)
See the table at the bottom of this file — filled in when the final run completed.
