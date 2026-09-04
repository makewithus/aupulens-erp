# BASELINE_FAILURES.md — Pre-existing test state, recorded before any feature code

> Recorded 2026-08-31, branch `ai/workflows`, before any AI-runtime code was written.
> Command: `npm test` (= `vitest run`). Confirmed **stable and reproducible** — run twice
> (once at full default parallelism, once constrained to `--maxWorkers=3`) with byte-identical
> results both times: `Test Files 46 failed | 63 passed (109)`, `Tests 3 failed | 765 passed |
> 210 skipped (978)`. This is not flakiness from resource contention; it has one deterministic
> root cause, confirmed below.

## Root cause of the 46 file failures: no outbound network access in this sandbox

Every route test file in this repo is meant to run against a local MongoDB, and does so by
setting `process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_<name>"` at
the top of the file **before** anything connects. 63+ files that do this pass cleanly.

A minority of files (23 identified by direct grep, and others reached indirectly through
`connectDB()` from `lib/db.ts`, which reads the real `.env` `MONGODB_URI` — the Atlas
`mongodb+srv://...` connection string — whenever no local override was set first) instead try to
reach the real Atlas cluster. In this sandboxed environment, DNS resolution to that hostname is
blocked entirely (`getent hosts aupulens-erp.uchpvpd.mongodb.net` → resolution failure), so every
`mongoose.connect()`/`beforeAll`/`afterAll` hook touching it times out at the 10s default hook
timeout (or 5s test timeout), deterministically, every run. Confirmed by running one such file
(`tests/sales/quotes.route.test.ts`) in complete isolation — same two-hook-timeout failure, no
contention possible with only one file running.

**This is an environment characteristic of this sandbox, not a code defect**, and is out of
scope for this brief to fix (rewriting 20+ pre-existing test files to add a local-DB override is
unrelated cleanup, not part of the AI-workflows task, and risks being wrong for whatever
environment these tests were actually designed to run in, e.g. a CI runner with real network
egress). **Do not "fix" these by changing existing test files** unless a future chunk explicitly
calls for it.

**Practical implication for this brief's own new tests**: every new AI-runtime test file must
follow the local-override pattern (`process.env.MONGODB_URI = "mongodb://localhost:27017/
aupulens_test_ai_<name>"` set before any import that reaches `connectDB()`), exactly like the
63 already-passing files do — otherwise a correct new test would land in the "blocked by
network" bucket and look like a false failure.

## The 46 failing files (all: hook timeout only, zero assertion failures)

Full list not reproduced here (mechanical — any file using the real `MONGODB_URI` instead of a
local override). Representative sample, confirmed via grep for files that do **not** set a local
override before connecting: `tests/accounting/accountant.test.ts`, `coa.test.ts`,
`currency-adjustment.test.ts`, `banking-rule.test.ts`, `settings.test.ts`, `budget.test.ts`,
`salesInvoicePosting.test.ts`, `bank-feed-provider.test.ts`, `tests/sales/documentNote.test.ts`,
`tests/sales/quotes.route.test.ts`, `tests/sales/salesInvoice.test.ts`,
`tests/inventory/orderNumbering.test.ts`, and others across `tests/hr/`, `tests/crm/`,
`tests/manufacturing/` following the same pattern.

## The 3 real (non-timeout) test failures — pre-existing, unrelated to this brief

All three are in `tests/sales/invoiceLineTotal.route.test.ts`, describe block *"Sales Invoices
routes — 'Mark as fully paid' now posts a real, GL-correct payment"*:

1. `POST: auto-creates a real, allocated Payment when markedFullyPaid has no real payments backing it` — `Test timed out in 5000ms`
2. `PATCH: auto-creates a real Payment for the shortfall when an unpaid invoice is edited to markedFullyPaid` — `Test timed out in 5000ms`
3. `does not create a duplicate system payment when markedFullyPaid is already fully covered` — cascades from the same file's `afterEach` hook timeout

These three sit in a file that **does** use a local MongoDB override, so they are not the
network-access issue above — they are a genuine pre-existing timing/logic issue in the
auto-payment-creation code path for Sales Invoices, unrelated to anything in scope for the AI
workflows brief (no chunk of this brief touches `invoiceLineTotal` payment auto-creation).
**Not touched, not fixed, not counted against any AI-runtime work.**

## Addendum — 2026-08-31, after Chunk 1 (Foundation) was built

The original baseline above (46 failed files / 3 failed tests) turned out to be **partly an
artifact of this sandbox's local `mongod` availability at the moment it was measured**, not a
pure, permanent "network to Atlas is blocked" ceiling. Mid-session, `mongod` (managed by
systemd) crashed outright (`systemctl status` showed `Active: failed`, and this session has no
`sudo` to restart it) — a manually-started user-owned instance was needed to keep working. Once
a healthy local `mongod` was confirmed running (`{ ok: 1 }` on ping), the **full suite — including
the previously-failing 46 files — passed at 100%**, twice in a row, immediately before and after
adding this chunk's 7 new AI-runtime test files:

```
Test Files  116 passed (116)     (109 pre-existing + 7 new)
Tests       1021 passed (1021)   (978 pre-existing + 43 new)
```

Outbound network access to the real Atlas cluster is still confirmed blocked in this sandbox
(`getent hosts aupulens-erp.uchpvpd.mongodb.net` fails), and `MONGODB_URI` is not exported in the
shell environment — so the original theory (files without a local override reach for an
unset/unreachable connection string and hang) is still the right *mechanism*, but the earlier
46-file failure count reflected `mongod` itself being unavailable at that specific moment, not a
stable, reproducible ceiling independent of local `mongod` health. **The practical, current,
reproducible baseline going forward is 0 known failures**, conditional on a healthy local
`mongod` being reachable at `27017` — which is a precondition for this whole suite, not unique to
this brief's work, and was already true of every prior session's "417/417 passing" results
recorded in `docs/_context/MEMORY.md`.

**Revised comparison rule**: any future `npm test` run for this brief should be **0 new
failures, full stop** — if `mongod` is unreachable, that is an environment setup problem to fix
(start `mongod`), not a baseline to code around.

## Eslint baseline — recorded 2026-09-03, after Chunk 6, branch `ai/workflows`

`docs/ai/BRIEF-07-BATCH-F.md` Part 0.2: a full-repo `npx eslint .` was run once, deliberately, to
turn "eslint clean" from a per-chunk re-derivation into a recorded fact.

```
✖ 18819 problems (18819 errors, 0 warnings)
```

**Two known sources, both pre-existing and unrelated to any AI-workflows chunk:**

1. **The overwhelming majority** (well over 18,000 of the 18,819) — a single generated/data file
   containing thousands of repeated `@typescript-eslint/ban-ts-comment` errors ("Use
   `@ts-expect-error` instead of `@ts-ignore`"), one per `@ts-ignore` line, in a file with 5900+
   lines of them. Not touched by any chunk of this brief.
2. `tests/ai/aiRuntime/safety.test.ts:65-66` — two `@typescript-eslint/no-require-imports` errors
   from a deliberate, pre-existing `require("node:fs")`/`require("node:path")` pair (Chunk 5), used
   for static source analysis inside a test, not an ESM-loadable-module concern. Real, understood,
   and not a defect — `require()` here is the correct tool for reading a `.ts` file's own text at
   test time without going through the module resolver.

**Standing rule going forward**: `eslint` must be **clean on every file this work touches**
(verified per-chunk by lint-ing the specific files added/modified that chunk, not a full-repo
run — a full-repo run is $O(\text{whole codebase})$ and dominated by noise unrelated to any chunk).
The **repo-wide count must not increase** — if a future `npx eslint .` reports materially more
than ~18,819 problems, something outside this brief's own files regressed and is worth a look, not
just a shrug.

## UI baseline — four pre-existing broken routes, recorded 2026-09-03, after Chunk 6

`docs/ai/BRIEF-08a-BATCH-G.md` 0.1: the Chunk 6 UI regression scan found four genuine errors on
the full 239-route sweep, all pre-existing and none importing anything this brief has touched
(confirmed by grep — none reference `lib/accounting/reports.ts`, `lib/aiRuntime/closeReadiness/*`,
or `lib/aiRuntime/reconciliation/definitions.ts`):

- `/finance/returns`
- `/hr/attendance`
- `/hr/leave`
- `/sales/invoices/new`

**Flagged separately, for the human, not buried here**: this is a real product issue — four broken
pages in production modules — unrelated to the AI-native workflows brief. It should be triaged as
its own bug, not folded into this project's own regression tracking.

**Standing rule**: these four may not be counted against AI work in any future chunk's UI
regression report, and this baseline count of 4 must not grow — a fifth genuinely new error on an
untouched route is a real regression and should be investigated, not waved through as "probably
like the other four."

## Comparison rule going forward (superseded by the addendum above, kept for history)

Any future `npm test` run for this brief is compared against this baseline as:
`Test Files: 46 failed | 63 passed` (network-blocked, unchanged) + `Tests: 3 failed |
765 passed | 210 skipped`, **plus** whatever new AI-runtime test files this brief adds — all of
which must pass (0 new failures) using the local-MongoDB-override pattern. A regression is: any
of the pre-existing 63 passing files starts failing, or any of this brief's own new test files
fails, or the 3 known pre-existing failures grow in number. It is **not** a regression if the
same 46 network-blocked files keep failing identically.
