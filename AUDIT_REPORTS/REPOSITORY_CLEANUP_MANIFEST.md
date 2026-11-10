# Repository Cleanup Manifest

Branch `feature/resource-optimization-remediation`. Method: import-graph reachability (`scripts/audit/orphans.mjs`, TypeScript AST; roots = Next convention files, `middleware`/`auth`/configs, tests, scripts, electron, CI, types) **plus** a path-specific text search over every tracked file and the ignored docs, **plus** a check for filesystem/glob-based discovery (none exists in `app`, `lib`, `components`, `config`, `models`). A file was deleted only when all three agreed. Every deletion is a `git rm`, reversible with `git revert` / `git checkout 30de35b1 -- <path>`.

## Deleted (36 files, 3638 lines)

| # | Path | Lines | Evidence / reason |
|---|---|---|---|
| 1 | `app/sales/sale-orders/popup/SaleOrderPopup.tsx` | 661 | component in `app/` that is not a Next convention file (no page/layout/route in its directory) and imported nowhere; directory held only this file |
| 2 | `components/admin/Analytics.tsx` | 759 | no import anywhere (only unrelated word matches); its sole dependency chain (`ui/resizable`) died with it |
| 3 | `components/crm/CrmOnboarding.tsx` | 85 | no import; name appears only as substrings of other identifiers |
| 4 | `components/crm/GlobalSearch.tsx` | 130 | no import; the live search UI is `components/dashboard/GlobalSearch.tsx` |
| 5 | `components/dashboard/CommandCenterInput.tsx` | 195 | no import; mentioned only in a comment in `crm/mobile/VoiceNotes.tsx` |
| 6 | `components/dashboard/summary/StatCard.tsx` | 49 | no importer of this path; consumers import other StatCard modules |
| 7 | `components/finance/StatCard.tsx` | 111 | no importer of this path (duplicate StatCard) |
| 8 | `components/hr/AttendanceOverview.tsx` | 110 | no import or path reference |
| 9 | `components/hr/RecentHires.tsx` | 168 | no import or path reference |
| 10 | `components/inventory/manufacturing/ManufacturingActions.tsx` | 43 | referenced only by its dead sibling ManufacturingCard |
| 11 | `components/inventory/manufacturing/ManufacturingCard.tsx` | 124 | no importer (its parent ManufacturingList was removed in the earlier optimization commit) |
| 12 | `components/inventory/manufacturing/ManufacturingEmpty.tsx` | 27 | no importer |
| 13 | `components/inventory/manufacturing/ManufacturingWorkflow.tsx` | 60 | referenced only by dead ManufacturingCard |
| 14 | `components/inventory/transfer/TransferActions.tsx` | 42 | referenced only by dead TransferCard |
| 15 | `components/inventory/transfer/TransferCard.tsx` | 108 | no importer (parent TransferList removed earlier) |
| 16 | `components/inventory/transfer/TransferWorkflow.tsx` | 74 | referenced only by dead TransferCard |
| 17 | `components/manufacturing/tracking/index.ts` | 7 | barrel never imported: `app/manufacturing/tracking/page.tsx` imports each module by full path |
| 18 | `components/ui/lamp.tsx` | 81 | unused shadcn/aceternity decoration; no import |
| 19 | `components/ui/resizable.tsx` | 56 | only importer was dead `admin/Analytics.tsx`; made `react-resizable-panels` removable |
| 20 | `lib/crm/ai/dealRiskEngine.ts` | 36 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 21 | `lib/crm/caseMetrics.ts` | 34 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 22 | `lib/crm/contractMetrics.ts` | 34 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 23 | `lib/crm/customerHealth.ts` | 32 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 24 | `lib/crm/customerSuccess/retentionAnalytics.ts` | 27 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 25 | `lib/crm/customerSuccess/satisfactionAnalytics.ts` | 22 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 26 | `lib/crm/dataQuality.ts` | 89 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 27 | `lib/crm/documentService.ts` | 161 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 28 | `lib/crm/forecasting/ForecastAccuracyEngine.ts` | 27 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 29 | `lib/crm/forecasting/PipelineCoverageEngine.ts` | 20 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 30 | `lib/crm/forecasting/RevenueForecastEngine.ts` | 52 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 31 | `lib/crm/onboarding/onboardingEngine.ts` | 52 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 32 | `lib/crm/salesAnalytics/conversionAnalytics.ts` | 26 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 33 | `lib/crm/salesAnalytics/dealLossAnalytics.ts` | 30 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 34 | `lib/crm/salesAnalytics/salesCycleAnalytics.ts` | 34 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 35 | `lib/crm/taskAutomations.ts` | 64 | no importer of this path anywhere (app, lib, components, tests, scripts, docs); not discovered by filesystem scan (no readdir/glob exists); CRM unreferenced analytics/automation engine |
| 36 | `lib/platform/scheduler/opportunistic.ts` | 8 | deprecated no-op left as a compat shim in the earlier optimization; its only importer (`adminSession.ts`) was removed there; remaining mentions are comments / the `lastRunTrigger` enum string (kept for stored data) |

Framework-discovered files (`page`, `layout`, `route`, `loading`, `error`, `middleware`, metadata/icon conventions) deleted: **none** (verified: no deleted path matches those names).

## Also removed (not file deletions)
- **456 unused import bindings in 172 files** (104 whole import statements) reported by `tsc --noEmit --noUnusedLocals` (TS6133/6192/6196/6198), tests and scripts excluded. Behaviour-neutral because `isolatedModules` is on and `verbatimModuleSyntax` is off, so TypeScript/SWC already elide unused imports. Tool: `scripts/audit/remove-unused-imports.mjs`.
- **6 npm dependencies** — see `DEPENDENCY_CLEANUP_REPORT.md`.

## PRESERVED — REQUIRES MANUAL REVIEW
| Path | Why it is an orphan | Why it was kept |
|---|---|---|
| `lib/crm/security.ts` | no importer; exports `maskSensitiveData`, `validateCronSecret`, `checkRateLimit` | security helpers: unused ≠ safe to delete without the owner's intent; may be meant to be adopted |
| `lib/crm/notifications.ts` | no importer; `createNotification()` | looks like an intended notification hook; CRM notification API exists |
| `lib/crm/filterEngine.ts` | no importer; `buildMongoQuery` | `models/crm/SavedView.ts` documents that stored filters are built with it — design intent |
| `models/legacy/{ApprovalRequest,Campaign,Case}.ts` | not imported | Mongoose models/collections are never deleted on import-graph evidence alone; three sibling `models/legacy` files are used |
| `graph/` (`analytics.html`, `js/*`, `css/*`) | `js/*` only referenced by the HTML | standalone static prototype page, outside Next; looks user-authored |
| 448 unused *named exports* in 203 files | see `DEAD_CODE_CLEANUP_REPORT.md` | consumers may use registries/dynamic access this analysis cannot see; removal gives little value |
| Ignored/untracked user data: `.env`, `.next`, `.next-build`, `tmp/`, `artifacts/`, `audit_output/`, `docs/*` (ignored), `RETEST_AUPULENS*`, `CI_CD_Error.md`, `.agents/` | not part of the tracked tree | explicitly protected; never touched |
| `AUDIT_REPORTS/*` | historical | explicitly protected |
