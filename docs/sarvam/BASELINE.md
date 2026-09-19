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

## Honest caveat found later — the baseline is *almost* stable, and the residual noise is characterised
Two more runs of the branch point (runs 4 and 5) were taken while verifying the branch:

| Run | Failed tests | Failed files | Notes |
|---|---|---|---|
| 4 | 0 | 0 | clean |
| 5 | 2 | 3 | `tests/platform/organizationCreate.test.ts`, `tests/sales/invoiceLineTotal.route.test.ts`, `tests/ai/aiRuntime/ai26AccountingPolicy.test.ts` — `Test timed out in 5000ms` / `Hook timed out in 10000ms` |

So on the **untouched branch point**, 4 of 5 runs at `--maxWorkers=3` were fully clean and 1 of 5 had timeout-only failures (no
assertion failures, ever). The failing files are different each time and every one of them passes when run alone; they are the
Mongo-backed tests whose `beforeAll` (connect + many `Model.init()` + dynamic imports) sits close to the 10 s hook limit when the
machine is busy. `invoiceLineTotal.route.test.ts` is the same file `docs/ai/BASELINE_FAILURES.md` already flagged as timing-sensitive.

## The rule (refined — exact, so "regression" stays provable)
1. Run `npx vitest run --maxWorkers=3`.
2. **A failing *assertion* is always a regression.** (Zero assertion failures were ever seen on the branch point in 5 runs.)
3. A **timeout-only** failure (`Test timed out in 5000ms` / `Hook timed out in 10000ms`) is *load noise* iff the file passes when re-run
   alone (`npx vitest run <file>`) **and** the run is repeated once and the same file does not fail again. A file that times out
   in two consecutive full runs, or fails alone, is a regression.
4. Keep the machine quiet while measuring (no other test/build processes) — every clean run above was taken that way.

## Result on `sarvam`
Recorded in `STATUS.md` and in the final report: number of full runs, files/tests, and any timeout-only files with their isolation results.
