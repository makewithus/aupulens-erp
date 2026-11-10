# Dead Code Cleanup Report

## Removed
| Kind | Count | Detail |
|---|---|---|
| Unreferenced modules (functions/components/engines inside them) | 36 files, 3,629 lines | components (19 files, incl. 8 pieces of the already-orphaned Manufacturing/Transfer card clusters, 2 duplicate `StatCard`s, `crm/GlobalSearch` duplicate), 16 `lib/crm` analytics/automation engines, 1 deprecated scheduler shim. List with evidence: `REPOSITORY_CLEANUP_MANIFEST.md` |
| Unused import bindings | 456 in 172 files | 104 whole `import` statements + 352 individual specifiers; `app/`, `components/`, `lib/`, `models/`, `config/`, `store/`, `providers/`, `middleware.ts`, `auth*.ts`. Tests and scripts untouched |
| Unused React hooks | 0 | none found unreferenced (all hooks resolve to reachable files) |
| Duplicate implementations consolidated | 0 | the two `StatCard` and the two `GlobalSearch` files had no consumers on the removed copy; the live copies were not modified. No "equivalent behaviour" merge was attempted |
| Unreachable branches / obsolete flags | 0 changed | not mechanically detectable with confidence; none removed |

## Not removed (report-only)
| Item | Count | Why not |
|---|---|---|
| Unused **non-import** locals/parameters (`tsc --noUnusedLocals`, non-test) | 115 | initialisers may have side effects (DB calls, `await`), removal needs per-site review |
| Unused **named exports** (`scripts/audit/unused-exports.mjs`) | 448 in 203 files (lib 180, components 19, config 2, providers 1, store 1) | may be consumed by name through registries, dynamic access, or kept as public surface; removing exports changes nothing at runtime and risks nothing to leave |
| Orphan modules kept deliberately | 8 files | `lib/crm/{security,notifications,filterEngine}.ts`, `models/legacy/{ApprovalRequest,Campaign,Case}.ts`, `graph/js/*` — see manifest |
| Tests with unused imports | 97 diagnostics | tests were not modified |

## Verification after removal
`tsc` (source-only check config) exit 0, ESLint exit 0, full vitest suite (see `CLEANUP_TEST_RESULTS.md`), production build exit 0 (591/591 pages). No test, route or framework-discovered file was removed.

## Tooling added (kept in repo, `scripts/audit/`)
`orphans.mjs` (reachability), `remove-unused-imports.mjs`, `unused-exports.mjs`, plus the earlier `query-inventory.mjs` and `render-inventory-report.py`. They are analysis aids; a result is a *candidate* until manually verified.
