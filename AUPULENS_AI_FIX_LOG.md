# AI QA fix log

Existing uncommitted work preserved. No commit, push, production DB access or deployment performed.

- Added lib/ai/erpQuery.ts: validated server-side query execution, projections, limits, timeouts, exact identifiers, counts/sums/grouping, tenant-scoped customer and linked invoice resolution.
- Added erpIntent.ts, erpAssistant.ts, erpAssistantClient.ts: deterministic QA intent, compact rendering, safe errors, stored query follow-up, actual account-plan response; wired into admin/sales routes, record lookup endpoint, admin/sales pages and global sidebar.
- Added quoteDraft.ts: draft proposal, canonical calculation preview, explicit confirmation/cancellation, expiry, owner/conversation scope, current catalog revalidation, atomic execution claim and unique quote source index.
- Added lib/sales/quoteValidation.ts and createQuote.ts; regular quote creation shares service with AI, PATCH and UI validate before save; invoice POST/PATCH reject invalid financial inputs.
- Added invoiceEligibility.ts; Sales Dashboard filters eligible issued invoices by invoiceDate. Admin/Sales summary totals now aggregate all issued invoices; no GL accounting policy changed.
- Extended ChatHistory with last query and pending proposal; SalesQuotation with positive quantity and optional source proposal index. No destructive migration.
- Meter: retry action, truthful unavailable/unconfigured cards, safe usage diagnostics; getAiCreditBalance rejects configuration-error fallback values.
- UI: synchronous send guard on admin/sales pages. Global sidebar uses common authoritative tools. Existing provider paths and memory remain available for other prompts.
- Added guarded optional disposable Mongo test setup, ERP intent and real Mongo QA suites. Existing usage integration now seeds canonical plans so it verifies configured limits rather than permissive fallback values.
- Posting fixture repair: shorten unique DB names; connected test fixture owns DB manager for runtime events. Assertions unchanged.

Evidence and final statuses are in AUPULENS_AI_FINAL_ACCEPTANCE_REPORT.md. Local screenshots/logs under scratch/ai-qa-evidence contain synthetic test records only. Session-token artifact is temporary and must be removed after browser checks.

Further regression findings:
- Command confirmation reply translation was executed outside tenantAi and omitted from Sarvam usage instrumentation. The command route now records only outbound calls; the integration test verifies one input and one output translation on the first request, then no additional translation or metering on repeat. This corrects the stale one-direction test expectation with stronger per-direction/repeat assertions.
- Guided task-flow reply translation lacked the input-side allowance gate. Cached replies remain free; local continuations don't trigger paid replies; initial regional replies are translated only within allowance. Existing cap/charging and end-to-end Hindi tests verify both constraints.
- The dashboard performance fixture expected revenue/expenses without seeding posted journals, although the route explicitly reports posted_journal_entries. It now seeds real balanced journals, retains original revenue/expense assertions and verifies net income/ledger availability. Its obsolete totalExpenseRecords assertion is replaced by checks proving unposted expense documents aren't reported as ledger cost. Production dashboard code is unchanged by that fixture repair.
- Sales chat-history refresh bypasses stale cached GETs after server-side tool persistence, so new chats appear immediately.
- Provider timeout/rate-limit/failure categories are safe and explicit in admin/sales routes; interrupted streams no longer fall back to an apparently successful sales snapshot. Direct route inputs reject malformed conversation selectors before DB access. New error-contract tests verify no diagnostic leakage.


## 24 October follow-up: quote draft edits and explicit zero-credit replies

Implemented stored proposal updates in `lib/ai/quoteDraft.ts`; wired edit intent/dispatch in `lib/ai/erpIntent.ts` and `lib/ai/erpAssistant.ts`. Preserved confirmation, unit validation, tenant/owner/conversation isolation, and retry safety; moved confirmation claiming before product validation to prevent editing during execution.

Added server-reported free-response usage metadata through `lib/ai/erpAssistantClient.ts`, persisted it via `lib/ai/conversationContext.ts` and `models/ai/ChatHistory.ts`, and displayed it in Sales/Admin chat with `components/ai/AiUsageIndicator.tsx`. Billing rates and provider charging policy were preserved as explicitly requested.

Added real MongoDB integration regressions in `tests/ai/quoteDraftEditing.integration.test.ts` and label-rendering coverage in `tests/ai/usageIndicator.test.ts`. Full suite passes (2,971 passed, 9 skipped); 100 focused tests and 34 browser observations pass. Current build result and retained evidence are recorded in [the follow-up report](AUPULENS_AI_RED_MARK_FIXES_2026-10-24.md).
