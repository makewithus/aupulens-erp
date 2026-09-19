# PERFORMANCE — measured 2026-09-19 (branch `sarvam`)

## Baseline (before the layer): Azure OpenAI chat, single call, max_tokens 5, from this sandbox
3.52 s (cold) · 2.05 s · 1.85 s. The layer is measured as a **delta** on top of this.

## Layer overhead (provider mocked at 0 ms; our own code only)  — `tests/ai/language/perf.test.ts`
| Path | Budget p95 | Measured p50 / p95 / p99 |
|---|---|---|
| English input (added latency) | < 50 ms | 0.022 / **0.041** / 0.066 ms (2,000 samples, 6 rotating sentences) |
| Deterministic normalisation only (messy English: caps, emoji, zero-width, typo, number words, GSTIN) | < 100 ms | p95 **0.046** ms |
| Regional, cached | < 200 ms | p95 **0.025** ms |
| Regional, uncached — our overhead excluding the network | < 1.5 s incl. provider | p95 **0.037** ms + one Sarvam round trip (**unmeasured: no key here — see LIVE_VERIFICATION §3.7**) |

**English delta vs baseline:** +0.04 ms on a 1,850–3,520 ms call ≈ 0.002 %. English input makes no provider call, reads no config, touches no DB, and writes no trace (only regional/degraded interactions are persisted).

## Design decisions that protect these numbers
- Detection is local (script ranges + word lists); Sarvam's `/text-lid` is never on the hot path — ambiguous input uses `source_language_code: "auto"` on the translate call itself (one call, not two).
- Deterministic normalisation runs before, and instead of, any model pass. There is **no LLM normalisation pass**: GPT-4o tolerates residual typos, and adding a call would break the English budget.
- Long input is chunked and translated in **parallel**.
- Cache: per-tenant, 10 min TTL, 500 entries, keyed on the raw text.
- Hard timeout: `SARVAM_TIMEOUT_MS` (2 s) over the *whole* call including its one retry.

## Still to measure (needs the live key)
Regional uncached end-to-end (target < 1.5 s), `direct` vs `transliterate_first`, and reply-translation latency.

---
# Phase 2 additions (2026-09-19)

## Guided task-flow turn latency — `tests/ai/taskFlow/perf.test.ts` (engine + session logic + language layer; provider mocked at 0 ms; in-memory session/customer lookups)
| Turn | Budget | Measured |
|---|---|---|
| English clarifying-question turn (5-turn conversation, per conversation) | < 1 s / turn | p50 0.58 ms · p95 **1.12 ms** for the *whole* 5-turn conversation |
| Regional (Roman Hindi) 2-turn exchange, reply translation uncached | < 1 s / turn | p95 **0.74 ms** (our overhead) + Sarvam round trip(s) per turn |
| Regional turn, repeated question template | < 200 ms | **0 provider calls** — input cache (per tenant) + reply cache (masked template, cross-tenant-safe) |

Real-world turn time = our overhead + (English: one internal `GET /api/sales/customers` round trip only on the first turn and on
customer answers) + (regional: 1 Sarvam translate for the input, 0–1 for the reply; the reply call is skipped when the question
template was translated before). Live numbers need the key — `LIVE_VERIFICATION.md` §4.

## English path — unchanged and re-measured after Phase 2
`tests/ai/language/perf.test.ts` still passes its budgets (English p95 ≈ 0.04 ms). Additional English-path guarantees added in Phase 2:
* The browser never calls `/api/ai/task-flow` for an English message unless it is about an invoice **and** reads as a create/explain
  request (`shouldConsultTaskFlow`) — "show unpaid invoices", "what's my balance", etc. cost zero extra round trips.
* The cost-cap check (`allowProvider`) is asked lazily, only when a provider call is about to happen — never for English or a cache hit,
  so the English path still touches no DB.
* English invoice-create requests no longer wait for a `/api/ai/prefill` LLM extraction: the guided flow is deterministic (no Azure call),
  so the first response is *faster* than before (one internal customers lookup instead of a ~2 s model call).
