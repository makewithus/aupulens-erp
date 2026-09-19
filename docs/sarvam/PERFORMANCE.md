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
