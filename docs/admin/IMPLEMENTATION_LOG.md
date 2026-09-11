# IMPLEMENTATION_LOG.md — Global Admin Control Plane

> Append one entry per phase. Never edit a prior entry except to append a correction dated later.

---

## Phase 0 — Discovery (2026-09-09)

**What existed before**: the full AI-workflows project's inventory (`docs/ai/SYSTEM_INVENTORY.md`,
`GLOSSARY.md`, `DECISIONS.md`, `BASELINE_FAILURES.md`, `UI_REGRESSION.md`), a live `master-admin`
role and portal, three divergent organisation-creation code paths, a thin `Organization.tier`
billing surface, `AiUsage`/`ActivityLog` coarse metering/logging, and rich per-run AI data
(`AiWorkflowRun`/`AiDecisionTrace`) not yet aggregated as usage.

**What was built this phase**:
- `docs/admin/SYSTEM_INVENTORY_DELTA.md` — corrections to the brief's own assumptions (2
  referenced docs don't exist under the names given; baseline test count changed; `master-admin`
  is live, not vestigial) plus new findings specific to the admin brief (org-creation paths,
  billing surface, logging comparison, NextAuth session seam).
- `docs/admin/CAPABILITY_MAP.md` — MISSING/PARTIAL/EXISTS for every phase's scope.
- `docs/admin/OPEN_QUESTIONS.md` — 5 entries, none blocking, each resolved with a stated safe
  default per Part 1.2.
- Refreshed `artifacts/api-surface.txt` (412→424 routes) and `artifacts/routes.txt` (239→240
  pages) to the current tree, since both were stale by ~2 weeks.

**Tests**: ran full suite (`npx vitest run --maxWorkers=3` — default parallelism produces 42
spurious mongod-connection-timeout failures from resource contention on this shared machine, a
known issue already documented in `docs/ai/BASELINE_FAILURES.md`). Result: `3 failed | 156 passed`
files, `5 failed | 1353 passed` tests — all 5 failures are pre-existing, deterministic (verified
via repeated and fully-sequential re-runs), and unrelated to this brief's scope (see
`OPEN_QUESTIONS.md` #5). `npx tsc --noEmit`: clean. Eslint: not re-run repo-wide (no files touched
yet this phase; existing ~18,819-problem baseline stands per its own standing rule).

**UI regression**: not run (no UI code exists yet to scan). Four pre-existing broken routes
(`/finance/returns`, `/hr/attendance`, `/hr/leave`, `/sales/invoices/new`) carried forward as
baseline.

**Could not do / deferred**: `docs/ai/audits/TIME_AUDIT.md` and `docs/ai/AI_Workflow_Test.md`
don't exist under those names — noted, alternate references identified for later phases.

**Assumptions in the brief that turned out wrong**: see `SYSTEM_INVENTORY_DELTA.md` §0, items 1-7.
The most consequential: `master-admin` is fully live and load-bearing, not a partial/vestigial
ancestor — Phase 1's admin-identity design proceeds as a fully separate, non-interacting domain.

**Commit**: local only, branch `global/admin`, no push.
