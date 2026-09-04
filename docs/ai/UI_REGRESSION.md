# UI_REGRESSION.md — how "zero diffs" is actually verified, and what it covers

> `docs/ai/BRIEF-07-BATCH-F.md` Part 0.1. Records the harness this brief's UI regression checks
> use, why, and exactly what a "zero diffs" claim in a chunk report does and doesn't cover.

## What was tried, in order, and what each one taught

1. **`next dev` against all 239 routes** (Chunks 5–6). Every route is a genuine first-time
   compile — observed 5–80s each. A cold run of the full route list took upwards of an hour and,
   once, was killed outright by a session-boundary teardown mid-run. Too slow to run per chunk;
   the brief called this correctly ("not a regression harness, it is an endurance test").

2. **Production build (`npm run build:local` + `npm run start:local`) against all 239 routes**
   (Chunk 7, first attempt). The build itself succeeded cleanly in a few minutes — confirming
   compilation is genuinely a one-time cost against a production build, as expected. But the full
   239-route scan against the running production server still failed: the warm-up pass logged
   **194 of 218 routes as TIMEOUT/ERR**, and the run then crashed outright
   (`page.waitForTimeout: Page crashed` — a Chromium-side crash, not a timeout).
   Diagnosed via `free -h`/`ps aux`: this is a **shared desktop machine**, not a dedicated CI
   sandbox — Firefox (dozens of tabs), VS Code, its TypeScript server, and this coding session
   were all running concurrently, leaving as little as ~2GB free RAM. The bottleneck was never
   Next.js compilation; it's contention for CPU/RAM with everything else the user has open. A
   production build does not fix that.

3. **Production build against a targeted ~28-route set** (Chunk 7, adopted). **0 timeouts in
   warm-up, 28/28 clean, total run time 102 seconds.** This is the brief's own documented
   fallback ("If the production build itself is too slow to run per chunk, fall back to a
   targeted scan") — and on this machine, it is the one that actually works reliably, not merely
   the cheaper option.

## The adopted methodology

**Build once, per chunk, against a production build — then scan a targeted route set, not all
239.**

```
npm run build:local
npm run start:local -- -p 3001    # separate port from any dev server already running
npx tsx scripts/ui-regression-scan.ts <outDir> artifacts/routes-targeted.txt http://localhost:3001
```

`artifacts/routes-targeted.txt` is rebuilt each chunk and — per `docs/ai/BRIEF-08a-BATCH-G.md`
0.2's coverage rule — **must always contain, in this order**:

1. **Every route in the branch diff's import graph** — every route whose page (or an API route it
   calls) imports a module this chunk touched, found via `grep -rl 'from "@/lib/path/to/touched/
   module"' app --include=*.tsx --include=*.ts`, then mapping any matched API route to the page(s)
   that call it.
2. **Every `/finance/ai-operations/**` route** — this project's own control surface, on every
   chunk's scan regardless of whether that chunk touched it directly, since it composes so much of
   the rest of the runtime that an unrelated change can still break it.
3. **A fixed canary sample of ~20 untouched routes spanning every module** (admin, CRM, finance,
   HR, inventory, manufacturing, sales, auth, integrations) — present specifically to catch a
   regression the import-graph search wouldn't predict (a shared layout, a global provider, a
   middleware change).

**Report the count and composition in every chunk's report** — "N/N clean" is only interpretable
alongside what N actually contains (e.g. "31/31 clean: 6 diff-graph + 5 ai-operations + 20
canary"), so a reader isn't left guessing whether "clean" covered anything relevant to what changed.

The warm-up pass (Task 0.2, Chunk 6) is kept as a safety net even against a production build —
it's cheap insurance and costs nothing extra now that the target set is small.

## Chunk 7's targeted route list and result

`artifacts/routes-targeted.txt` (28 routes): `/finance/ai-operations` (this brief's own new
surface) plus every route whose page or API dependency chain reaches `lib/accounting/reports.ts`,
`lib/aiRuntime/closeReadiness/{domains,compute}.ts`, or `lib/aiRuntime/reconciliation/
definitions.ts` (`/finance/accounting/{aged-partner,balance-sheet,profit-loss,trial-balance,
period-closing,journal-entries,bank-reconciliation,banking}`, `/finance/{ai-assistant,dashboard,
summary,expenses,assets}`), plus a 20-route canary across every other module.

**Result: 28/28 clean, 0 console errors, 0 page errors, 102 seconds total.** Output:
`artifacts/ui-chunk7-targeted/`.

## What "zero diffs" does and doesn't mean, going forward

A chunk's "UI regression: zero diffs" claim means: the routes plausibly reachable from that
chunk's own diff, plus a fixed 20-route canary, render clean against a production build. It does
**not** mean all 239 routes were re-verified every chunk — that full sweep last succeeded (212/239
clean, 4 pre-existing unrelated timeouts) at the end of Chunk 6 and is not repeated per-chunk on
this machine. If a chunk's diff is unusually broad (touches a shared layout, a global provider,
`middleware.ts`, or anything under `components/ui/`), widen the targeted list for that chunk
accordingly, or re-run the full 239-route sweep once, off-hours, when the machine is otherwise
idle — it is expensive here, not impossible.
