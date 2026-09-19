# Browser QA runner

Real Chrome (via `playwright-core`, no browser download) against a local dev server, a **local** MongoDB named `*browser_qa*`, and a mock Sarvam.

```
# 1. fixture (refuses to run unless MONGODB_URI is a local db containing "browser_qa")
export MONGODB_URI=mongodb://localhost:27017/aupulens_browser_qa
npx tsx scripts/seed-platform-demo.ts && npx tsx scripts/qa-browser-seed.ts /tmp/qa
# 2. mock provider + app
npx tsx scripts/qa-mock-sarvam.ts &                       # :4010, key "mock-key"
SARVAM_API_KEY=mock-key SARVAM_API_BASE_URL=http://127.0.0.1:4010 NEXT_PUBLIC_APP_ROOT_DOMAIN=localhost npx next dev -p 3100 &
# 3. runner (npm i playwright-core in any temp dir; point PLAYWRIGHT_CORE at its index.js)
QA_OUT=/tmp/qa PLAYWRIGHT_CORE=/path/to/playwright-core/index.js node docs/sarvam/qa-browser/run.mjs all
# provider-down case: stop the mock, then:  node run.mjs down
```
Tenants are `<sub>.localhost:3100`. Do NOT set `NEXTAUTH_URL` to one tenant's host (multi-tenant logins then fail with TenantMismatch).
Results: `$QA_OUT/results.json` + a screenshot per step.
