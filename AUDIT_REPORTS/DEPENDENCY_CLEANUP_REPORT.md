# Dependency Cleanup Report

Before: 59 dependencies + 17 devDependencies · After: **54 + 16** · `package-lock.json` 16,595 → 16,432 lines (−163; 1 line re-flagged `dev`). `npm uninstall … --ignore-scripts --offline`, no other version changed.

## Removed (6) — each has zero references in any tracked file (code, config, scripts, CI, docs) and in the ignored `scratch/`, `tmp/`, `scripts/`, `electron/`, `.agents/`, `artifacts/`
| Package | Evidence |
|---|---|
| `next-themes` | theme is handled by the project's own `store/themeStore` (`components/Logo.tsx`); no import |
| `react-hook-form` | no import (the shadcn `form.tsx` that would use it does not exist) |
| `@hookform/resolvers` | only meaningful with `react-hook-form`; no import |
| `react-resizable-panels` | sole consumer was the dead `components/ui/resizable.tsx` (deleted) |
| `glob` | no import/require; every package that needs glob brings its own nested copy (`npm ls glob` showed only transitive consumers) |
| `ts-morph` | devDependency; no import in tracked or scratch scripts |
Transitive packages pruned by npm with them: 21 total (e.g. `@ts-morph/common`, `code-block-writer`, `path-scurry`, `path-browserify`, a hoisted `lru-cache` copy).

## Kept although a text search finds no import (verified individually)
| Package | Why kept |
|---|---|
| `react-is` | peer dependency of `recharts` |
| `@types/bcryptjs`, `@types/qrcode`, `@types/adm-zip`, `@types/js-levenshtein`, `@types/nodemailer`, `@types/node`, `@types/react`, `@types/react-dom` | type packages for libraries / the runtime that are used |
| `eslint-config-next` | loaded by name through `compat.extends("next/core-web-vitals", "next/typescript")` in `eslint.config.mjs` |
| `concurrently`, `cross-env`, `wait-on`, `electron-builder` | invoked from `package.json` scripts (`electron:*`, `build:local`) |
| `baseline-browser-mapping` | read by browserslist/autoprefixer tooling; harmless config-level dependency, left for a separate audit |
`three` / `@types/three` were removed in the earlier optimization (lockfile fixed in the remediation).

## Consistency checks
`npm ci --dry-run` ok · `npm prune --dry-run` nothing to remove · `npm ls` reports only 5 `extraneous` optional wasm packages (`@emnapi/*`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`) which are **identical to before** (present in both lockfiles; not touched) · production build exit 0 · full test suite (see test results).

## `npm audit --omit=dev` (information only; nothing was fixed or upgraded)
18 advisories: 3 critical (`next`, `next-auth`, `@auth/core`), 11 high, 4 moderate. These are **pre-existing** and need a deliberate upgrade decision (Next/Auth.js majors); `npm audit fix` was intentionally not run. This is a release consideration independent of the cleanup.
