# Dependency Security (Final)

Fresh `npm audit --omit=dev` before and after. Before: **18** (3 critical, 11 high, 4 moderate). After: **8** (**0 critical**, 4 high, 4 moderate). Only packages with a published fix inside their current major were changed; no `npm audit fix --force`, no unrelated upgrades; `package.json`/`package-lock.json` in sync (`npm ci --dry-run`, `npm ls` clean). Reachability below is a **static judgement from the code, not a penetration test**.

## Fixed
| Package | From → To | Severity | Advisories | Direct? | Reachable? | Compat risk |
|---|---|---|---|---|---|---|
| `next` | 15.5.18 → **15.5.29** | critical | GHSA-p293-qw3h-jr36 (RCE, Windows hosts), GHSA-2xp9-vwfh-vxw4 (RCE, Image Optimization/AVIF), GHSA-2464-fhr4-w9xw (RCE, Image Optimization/SVG) + 11 high/moderate (Server Actions DoS/SSRF, rewrites SSRF, SSG/ISR cache poisoning across users, cache confusion) | direct | Yes: App Router + Server Actions + `next/image` are used | patch release; production build + 591 pages OK |
| `next-auth` | 5.0.0-beta.31 → **beta.32** | critical | GHSA-8fpg-xm3f-6cx3 (config errors can make existence-based `auth` checks fail open), GHSA-7rqj-j65f-68wh, GHSA-xmf8-cvqr-rfgj, GHSA-x445-f3h2-j279 | direct | the fail-open class is relevant (middleware relies on `auth`); the email-normalizer advisory is not (email provider unused) | beta→beta; login re-verified at runtime |
| `@auth/core` | 0.41.2 → **0.41.3** | critical | same Auth.js advisories | transitive | as above | patch |
| `mongoose` | 8.24.0 → **8.24.8** | moderate | GHSA-664h-wqgq-64gw (prototype pollution in update casting via `__proto__`-prefixed paths) | direct | yes (update paths take request data) | patch |
| `undici` | 6.26.0 → **6.29.1** | high | 15 advisories (WebSocket/EventSource DoS, TLS option drop, header/cookie injection) | direct | used by `lib/ai/claude.ts` outbound calls only | patch |
| `zod` | 4.1.12 → **4.6.7** | high | GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized constrained collections) | direct | yes (request validation) | minor; suite green |
| `nodemailer` | 9.0.3 → **10.4.0** | high | quadratic address/DKIM/SMTP parsing, recipient-domain validation bypass (≥ 10.1.4 needed) | direct | yes (`lib/email/sendEmail.ts`, recipient addresses) | **major**: one type line changed (`ReturnType<typeof createTransport>`); runtime API (`createTransport`/`sendMail`) is unchanged. Email sending **not exercised end-to-end** (no SMTP in test env; tests mock it). `next-auth`'s optional peer wants nodemailer ^7/^8 (was already mismatched at 9.0.3; Auth.js email provider is unused) |
| `sharp`, `nanoid`, `source-map-js`, `@xmldom/xmldom`, `minimatch` (partial) | in-range via `npm update` | high | libvips/libheif CVEs, nanoid generator loops, source-map-js DoS, xmldom injection | transitive | sharp via image pipeline: yes | patch-level |

## Remaining (8) — not fixed
| Package | Severity | Advisory | Why not fixed |
|---|---|---|---|
| **`xlsx`** (SheetJS) | **high** | GHSA-4r6h-8v6p-xvw6 (prototype pollution, < 0.19.3), GHSA-5pgg-2g8v-p4x9 (ReDoS, < 0.20.2) | **No fix exists on the npm registry** (latest 0.18.5; fixed releases are distributed only from SheetJS's own CDN). **Reachable:** 24 files import it, including spreadsheet upload/migration paths that parse user-supplied files. **This is the one remaining real exposure.** Options for the owner: install the vendor-hosted 0.20.x tarball (changes the lockfile source), migrate parsing to `exceljs`, or restrict upload size/rate and isolate parsing. Not done: swapping the spreadsheet library across 24 call sites needs its own parity testing |
| `next` (moderate), `postcss` (high), `@tailwindcss/postcss` (moderate) | via bundled `postcss` ≤ 8.5.22 | GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 (path traversal via attacker-controlled `sourceMappingURL` when postcss *processes CSS*) | build-time CSS processing of our own source; not reachable with request data. npm's only listed fix is `next@16.4.6` (a major) |
| `exceljs`, `uuid` | moderate | GHSA-w5hq-g745-h8pq (buffer bounds in uuid v3/v5/v6 when a buffer is passed) | npm's "fix" is a **downgrade to exceljs 3.4.0**; rejected. Code path requires passing a `buf` to uuid v3/v5/v6, which exceljs does not do from user input (judgement) |
| `brace-expansion` (1.1.13), `minimatch` | high | six DoS advisories on glob brace patterns | reachable only where a *pattern* is attacker-controlled; patterns here come from tooling (electron-builder, readdir-glob inside exceljs' archiver), not requests. A `package.json` override currently pins `brace-expansion`; left alone |

## Verification after changes
`tsc` exit 0 · `npm run lint` exit 0 · full suite (see `FINAL_PRODUCTION_RELEASE_GATE.md`) · production `next build` exit 0 with 591/591 pages on the upgraded Next · runtime login/RBAC/suspension on that build.

## Not done
Next 16 / Auth.js stable migration; replacing `xlsx`; a Dependabot/`npm audit` CI gate.
