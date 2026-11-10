# Final Repository Cleanup Manifest

Branch `chore/repository-cleanup`, based on `main` at `316b5927`. Nothing was merged, pushed to `main`, or deployed.

## Scope and method
- Scope is **Git-tracked files**. Git-ignored/untracked folders (`.next`, `.next-build`, `tmp`, `artifacts`, `audit_output`, `scratch`, `.agents`, ignored `docs/*`, `RETEST_*`, `.env`) are not part of the branch and were **not touched** (see "Preserved").
- Every deletion needed: no import edge (AST reachability, `scripts/audit/orphans.mjs`), no reference by path or exported name (`git grep` across tracked files incl. tests, scripts, config, CI), no framework-convention role, and no data/recovery role. Static analysis alone was never treated as sufficient.
- The previous commit (`316b5927`) had already removed the whole `AUDIT_REPORTS/` folder and most Markdown; this pass found little further dead code.

## Deleted files (13)
| # | Original path | Purpose | Reason | Reference analysis | Evidence removal is safe |
|---|---|---|---|---|---|
| 1 | `components/dashboard/AIAssistantWidget.tsx` (222 lines) | Floating chat widget component | Unused component, superseded by the AI sidebar/assistant pages | 0 imports; name `AIAssistantWidget` appears nowhere else (code, tests, config, docs) | `tsc` 0 errors, lint clean, production build passes after removal |
| 2 | `providers/confirm-provider.tsx` (61 lines) | Context provider for a confirm modal | Unused duplicate of the live `components/providers/ConfirmRoot.tsx` | 0 imports; `ConfirmProvider`/`confirm-provider` appear nowhere | Same; the whole `providers/` directory is now empty |
| 3 | `lib/crm/filterEngine.ts` (80 lines) | Builds a Mongo query from user filter groups | Unused; exports `FilterOperator`, `FilterCondition`, `FilterGroup`, `buildMongoQuery` referenced by no file (one comment in `models/crm/SavedView.ts` mentions the name) | 0 imports; 0 uses of each exported name | Same. Also removes an unused path that turned request data into a Mongo query |
| 4 | `lib/crm/notifications.ts` (16 lines) | `createNotification` helper writing a CRM notification | Unused; live notification flow uses `lib/crm/caseNotifications.ts` and the notifications API | 0 imports; `createNotification` used nowhere | Same |
| 5 | `lib/crm/security.ts` (46 lines) | `maskSensitiveData`, `validateCronSecret`, a local `checkRateLimit` | Unused; cron auth and rate limiting live in `lib/middleware/rateLimit.ts` and the cron routes | 0 imports; `maskSensitiveData`/`validateCronSecret` used nowhere; `checkRateLimit` hits elsewhere are the *other* implementation | Same; the 192-test cron-secret contract suite and rate-limit tests still pass |
| 6 | `docs/SUBSCRIPTION_BILLING_ACCEPTANCE_MATRIX.md` | Billing acceptance record | **Byte-identical** (`cmp`) to `docs/AUPULENS_SUBSCRIPTION_BILLING_ACCEPTANCE_REPORT.md`, which is kept | One link (`SUBSCRIPTION_BILLING_IMPLEMENTATION_REPORT.md`) re-pointed to the kept file; `.gitignore` allowlist line removed | No information lost |
| 7-11 | `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | create-next-app sample images | Unreferenced boilerplate | 0 references to any filename in code, CSS, config, Electron, tests | Build passes; Electron packs `public/**` but uses `logo.svg`/`logo.png` |

Edits (not deletions): `.gitignore` (one allowlist line), `docs/SUBSCRIPTION_BILLING_IMPLEMENTATION_REPORT.md` (one link).

## Restored (not a deletion)
`AUDIT_REPORTS/` was deleted by the previous commit. Six reports that carry **unresolved** findings were restored from `316b5927^`: `FINAL_PRODUCTION_RELEASE_GATE`, `G2_QUERY_OPTIMIZATION_FINAL`, `G6_AI_OUTBOX_FINAL`, `G7_SCHEDULER_FINAL`, `DEPENDENCY_SECURITY_FINAL`, `ERP_RUNTIME_VERIFICATION_FINAL`. Their figures are as of that earlier date. The rest remain recoverable from Git history (`git show 316b5927^:AUDIT_REPORTS/<name>`).

## Preserved although flagged (uncertain: not deleted)
| Item | Why flagged | Why preserved |
|---|---|---|
| `models/legacy/ApprovalRequest.ts`, `Campaign.ts`, `Case.ts` | 0 imports | Schemas for legacy collections that may still hold tenant data; removing the model removes the only code that can read it. Needs an owner decision |
| `graph/` (4 files) | `graph/js/*` flagged as orphans | Static analytics prototype page (HTML references its own scripts/CSS); user-authored design asset |
| 451 exports in 205 files with no named importer | Unused-export scan | Dominated by `lib/aiRuntime` tool/workflow modules reached through registries by name; not removable on static evidence |
| All 69 files in `scripts/` | 49 have no references | Migrations, backfills, repair/recovery, reference importers and documented demo seeders are run manually by name; none has a broken import. See `SEED_SCRIPT_CLEANUP_REPORT.md` |
| All of `hsn/` (8 files, 12 MB) | Some files only documented | HSN/SAC reference data is explicitly protected; `master_hsn_sac.json` and `sac.json` are live inputs |
| Inert `vi.mock` stubs in `tests/api/batch_tc0701_tc0757.test.ts` (2) and `tests/security/crmEditableNext.test.ts` (1) | Mock modules that no longer exist | Harmless, tests pass; editing tests for cosmetics is out of scope |
| `react-is`, `baseline-browser-mapping`, `eslint-config-next` | No direct import | Required (recharts peer, Next build, ESLint `next/*` configs) |

## Not touched (outside the branch)
`.next` (3.5 GB), `.next-build` (1.9 GB), `tmp` (134 MB, 4,431 files), `artifacts` (3.8 MB), `audit_output` (7.2 MB, GST data analysis), `scratch` (empty), `.agents/AGENTS.md`, 40 ignored files under `docs/`, `RETEST_AUPULENS.xlsx`, `RETEST_AUPULENS_STATUS_2026-10-30.md`, `.env`. They are user-created or pre-existing and are not tracked.
