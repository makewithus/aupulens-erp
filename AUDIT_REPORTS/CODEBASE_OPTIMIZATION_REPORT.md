# Codebase Optimization Report (dead code, exports, dependencies)

## Method
- Reachability: `scripts/audit/orphans.mjs` (TypeScript AST; roots = Next.js convention files, middleware/auth/config, tests, scripts, Electron, CI; edges = static/dynamic imports, `vi.mock`, any string literal resolving to a project file).
- Named exports: `scripts/audit/unused-exports.mjs` (report only).
- Each candidate was then checked by hand: `git grep` for path, file name and every exported identifier across all tracked files (code, tests, config, CI, docs), plus registry/dynamic-import review.

## Orphan files: 10 candidates -> 5 deleted, 5 kept
| Candidate | Outcome |
|---|---|
| `components/dashboard/AIAssistantWidget.tsx` | Deleted, 0 references |
| `providers/confirm-provider.tsx` | Deleted, 0 references (live version is `components/providers/ConfirmRoot.tsx`) |
| `lib/crm/filterEngine.ts` | Deleted, 0 uses of any export |
| `lib/crm/notifications.ts` | Deleted, 0 uses |
| `lib/crm/security.ts` | Deleted, 0 uses (the `checkRateLimit` name resolves to a different implementation) |
| `models/legacy/ApprovalRequest.ts`, `Campaign.ts`, `Case.ts` | **Kept**: schemas for legacy collections that may hold data |
| `graph/js/main.js`, `graph/js/theme.js` | **Kept**: loaded by `graph/analytics.html` via `<script>`; static user-authored page |

## Unused named exports: 451 in 205 files, none removed
By area: `lib/aiRuntime` 136, `lib/crm` 65, `lib/ai` 56, `lib/sales` 23, `lib/migration` 14, `lib/billing` 13, `lib/studio` 12, `lib/platform` 10, `components/charts` 9, `lib/tax` 8, `components/ui` 7, `lib/accounting` 7.
Largest: `lib/aiRuntime/tools/financeReadTools.ts` (16), `closeTools.ts` (9), `lib/ai/taskFlow/engine.ts` (8). The AI runtime exposes tools and workflows through registries and by-name lookup, so "no named importer" is not evidence of dead code. Recommended follow-up: remove per area with its owner, after adding a registry-coverage test.

## Dependencies
54 dependencies and 16 devDependencies scanned for any reference in source, config, scripts and `package.json` build settings. Unreferenced: `react-is`, `baseline-browser-mapping`, `eslint-config-next`. **None removed**: `eslint-config-next` is loaded by `eslint.config.mjs` through `next/core-web-vitals`/`next/typescript`; `react-is@19` is recharts' peer (`npm ls` shows it deduped under recharts 3.3.0); `baseline-browser-mapping` is the Next build data package. `package.json` and `package-lock.json` are unchanged, and `npm ci --dry-run` succeeds.
Pre-existing `npm ls` complaints (not introduced here): extraneous optional WASM packages (`@emnapi/*`, `@img/sharp-wasm32`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`), `nodemailer@10.4.0` vs next-auth's optional peer range, and optional `electron-builder-squirrel-windows`.

## Generated / temporary folders
Not tracked, not touched: `.next` 3.5 GB, `.next-build` 1.9 GB, `tmp` 134 MB (4,431 files), `artifacts` 3.8 MB, `audit_output` 7.2 MB, `scratch` empty. Pre-existing and user-owned; the verification build used a separate directory.
`tsconfig.tsbuildinfo` is ignored (`*.tsbuildinfo`).

## Items that need a decision, not a deletion
1. Legacy models (3) and `graph/` (above).
2. 31 AI workflows' side-effect idempotency, `xlsx` advisory, scheduler duration, G2 query limits: see the restored `AUDIT_REPORTS/*_FINAL.md` reports.
3. Stale `vi.mock` stubs (3) in two test files.
