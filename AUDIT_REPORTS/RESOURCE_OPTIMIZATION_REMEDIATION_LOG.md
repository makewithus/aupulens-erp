# Resource Optimization Remediation — Log

## Stage 0 — safety
- Repository: `/home/krrish/Desktop/Aupulens-ERP/Aupulens-ERP-main` (the outer `Aupulens-ERP/.git` is an empty directory).
- Start: branch `feature/resource-optimization`, HEAD `e20680af3cc62b6fb137bb43abbfbcf83bb0c5f4`, base `f38af917`. Working tree had **only** the four untracked audit reports written in the previous session (no user changes); they were carried onto the new branch and committed as `1ee667df`.
- Created `feature/resource-optimization-remediation`. No existing commit rewritten, amended or deleted. Nothing pushed.
- Read all reports (baseline, results, implementation log, independent audit, reconciliation, security verification, release gate) and re-verified claims in code before changing anything.
- Disk was 98 % full at start (1.8–2.5 GB free). Disk handling: no user directory (`.next` 3.3 GB, `.next-build` 1.9 GB, caches) was touched. Only artifacts this session created were deleted (partial `.next-audit` build dirs, scratch logs, disposable-Mongo data dir). One build attempt hit ENOSPC and a second briefly filled the disk (the 2-s watchdog was too slow); the third, with a 0.3-s watchdog and 4.0 GB free, completed (peak ≈ 2.1 GB).

## Commits (oldest → newest)
| Commit | Stage | Change |
|---|---|---|
| `1ee667df` | 0 | audit reports |
| `e0f4172a` | 1 | G5 `private, no-store` + `lib/api/noStore.ts` + tests |
| `6ea3dfd2` | 1 | G9 matcher keeps `/api/**` inside middleware + tests |
| `772ffb0d` | 1 | G8 atomic Lua rate-limit store + tests |
| `0be5279a` | 1 | G4 entitlement versioning, ≤60 s freshness, fail-closed, revocation + tests |
| `855646a0` | 2 | G6 transactional outbox, atomic claim, lease, backoff, health + tests |
| `209c61bf` | 2 | G7/G7a heartbeat, health endpoint, retry, post-run stale alerts, double-checked locking + tests |
| `b0e1fed6` | 3 | G2 billing overview → aggregation (+ parity test), AST inventory tool |
| `3e990204` | 3 | G2 keyset pagination helper, `/api/projects` opt-in + tests |
| `572506d9` | 4 | G12 lockfile sync |
| `01f835d2` | 4 | G10 `connectBaseDB` adopter + tests |
| `26294c0f` | 5 | outbox collection pre-create (found by QA test), fail-closed middleware tests, inventory renderer |
| (docs) | 6 | final reports |

## Defects found *by the new tests* while remediating (not just known audit items)
1. **Duplicate job execution**: a scheduler tick holding a pre-run snapshot re-ran a job right after another tick released its lock → double-checked locking.
2. **Outbox write inside a transaction failed on first use** ("catalog changes"; caught by the existing QA GST test) → collection pre-created before transactions.
3. **`run-due` `after()` callback could reject unhandled** when `runDueJobs` returned nothing (caught by the cron contract suite) → never-throwing callback.
4. **`schedule.due` was re-emitted with no dedupe on every sweep** (pre-existing; becomes a flood if the sweep runs every tick) → `scheduleId:nextRunDate` dedupe key.
5. **org-tier error responses lacked `no-store`** → fixed.

## Decisions
- Entitlement failure policy changed from fail-open to **fail-closed** (as required). The one existing test that encoded the old behaviour had its fixture updated, not its assertions.
- Pagination is **opt-in** (default unchanged) because no frontend consumer was migrated; flipping defaults would break dashboards that compute KPIs from the full array.
- Did not touch financial/ledger logic, RBAC, tenant scoping, or any export.
- No second scheduler trigger was added in code (documented option); no production configuration touched.
