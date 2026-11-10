# Repository Health Report

## Metrics (tracked files only; before = `30de35b1`, after = `002cc421`)
| Metric | Before | After |
|---|---|---|
| Tracked files | 2,382 | 2,352 (−36 deleted, +6 added: 3 audit scripts, `orphans.mjs`, a model, a lib file… see `git diff --name-status 30de35b1 HEAD`) |
| Directories with tracked files | 1,064 | 1,056 |
| TS/TSX lines | 372,543 | 368,051 (−4,492) |
| Dependencies / devDependencies | 59 / 17 | 54 / 16 |
| `package-lock.json` lines | 16,595 | 16,432 |
| `.git` size | 78 MB | unchanged (history kept) |
| Production build output | 2.1 GB dist dir (before and after; the build cache dominates, so no size improvement is claimed) | |
Files modified by the cleanup commits: 177 modified, 36 deleted, 6 added (code fixes + audit scripts); 175 of the modified are source files, 172 of them only for unused-import removal. **No CPU, memory, latency or cold-start improvement is claimed — none was measured.**

## Structure
`app` 853 files (pages + 500+ API routes) · `lib` ~500 · `components` ~236 · `models` 211 · `tests` ~395 · `scripts` 66 · `config` 11 · small: `store`, `providers`, `types`, `electron`, `hsn`, `graph`, `public`. Multi-tenant Next.js (App Router) + Mongoose + Auth.js; AI runtime in `lib/aiRuntime`; platform/scheduler in `lib/platform`; GitHub Actions is the scheduler trigger.

## Remaining cleanup opportunities (documented, not done)
1. **448 unused named exports** in 203 files (mostly `lib/`), 115 unused non-import locals — need per-site review.
2. **`lib/crm/{security,notifications,filterEngine}.ts` and `models/legacy/{ApprovalRequest,Campaign,Case}.ts`** — unreferenced; decide intent (adopt or delete).
3. **`graph/`** standalone prototype and **`scripts/`** (66 files; `ui-regression-scan.ts` / `verify-policy-loop.ts` import `playwright`, which is not a dependency and which `tsconfig.json` excludes by name) — audit which scripts are still used.
4. **`tsconfig.json` `include`** lists many generated `.next-*/types/**` paths (duplicated, Windows-style `.next\\dev/types`) added by past Next runs. Combined with stale ignored artifacts it makes default `npx tsc --noEmit` fragile (4 errors today, see test results). Recommend cleaning that list and removing the stale `.next`/`.next-build`/`tmp/*` artifacts — **owner's decision; not touched**.
5. **Disk**: the volume is ~97–99 % full; `.next` (3.3 GB), `.next-build` (1.9 GB), `~/.cache`, `~/.npm` (2.8 GB each) are the large candidates. A production build needs ≈ 2.1 GB free.
6. Ignored root clutter: `CI_CD_Error.md`, `RETEST_AUPULENS*`, `audit_output/`, `artifacts/`, `docs/*` (ignored), `tmp/` — user data, left.
7. **Security/dependency**: `npm audit --omit=dev` = 18 advisories (3 critical in `next`, `next-auth`, `@auth/core`; 11 high). Needs a deliberate upgrade plan; independent of cleanup.

## Architecture observations
- Entitlement enforcement is middleware-centred; handlers do RBAC/tenant checks but not module entitlement.
- Mocked unit tests missed three production-only defects this session (login `DataCloneError`, health route blocked by middleware, transaction/model-registry ordering). A small smoke test that boots the built app and logs in should be part of CI.
- `lib/db.ts::connectDB()` registers the whole model registry lazily; anything that triggers it inside a transaction now misbehaves — registration is therefore forced before `withAccountingTransaction`.
- Query-optimisation status is unchanged by this cleanup: 244 unbounded `find` / 71 unbounded `aggregate` in `app/api` (see `RESOURCE_OPTIMIZATION_QUERY_INVENTORY_FINAL.md`).
