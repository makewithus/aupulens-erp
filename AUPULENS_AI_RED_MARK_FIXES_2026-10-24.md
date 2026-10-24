# AI assistant — remaining red-item fixes, 24 October 2026

## Result and scope

Both previously red items are fixed and pass focused automated tests and actual local browser checks. The credit check follows the user's explicit decision: **keep database-only answers free and clearly show “0 credits used.”** A decrease on a free query is no longer the acceptance criterion.

These are local source and synthetic-data results. No deployment, production-data mutation, or actual paid AI-provider request was performed. The original historical ERP values and deployed environment remain unverified.

## Root causes and changes

### Quote edits — 🟢 fixed locally

`parseErpIntent` routed quantity/discount messages to `validate_values`. That branch only returned explanations and never updated `AiCommandProposal.params.line`. Confirmation consequently saved the original quantity.

The assistant now finds the pending proposal in the authenticated user's conversation and calls `updateQuoteDraft`. It:

- Updates quantity and percentage discount in the existing inert proposal, recalculating its preview with the shared invoice math.
- Rejects invalid, ambiguous or malformed edits before writing any values. Zero/negative quantities and discounts outside 0–100% leave the proposal unchanged.
- Preserves product fractional-unit rules and checks those rules again during confirmation.
- Restricts editing to the owning tenant, user and conversation, with Sales role/module access and active, unexpired, unexecuted proposal checks.
- Uses a conditional revision update to prevent lost concurrent changes. Confirmation claims the proposal **before** validation and uses the claimed line, preventing edits during confirmation from producing a stale saved quote.
- Keeps replay protection and requires explicit confirmation before creating a sales quote.

Actual browser result: two chairs at ₹7,499 initially produce ₹14,998. `make quantity 2.5` changes the preview to ₹18,747.50. A 10% discount changes it to ₹16,872.75. Requests for 150% discount and zero quantity are rejected. The saved quotation contains **qty 2.5, discount 10%, total ₹16,872.75**. Confirmation replay does not create another quote.

### Free-query credit visibility — 🟢 fixed locally

Database queries intentionally bypass the provider and incur no provider credit charge. The earlier checklist expected a deduction, while the UI did not explain why the balance stayed unchanged. The user explicitly approved keeping those answers free.

The server now returns `usage: { creditsUsed: 0, source: "erp" }` for its handled ERP responses. Sales and Admin chat pages display **“0 credits used · ERP lookup”** only when that metadata is present. The assistant response stores the zero-credit metadata in chat history, so reopening the conversation preserves the label. The meter details explain that ERP lookups are free and provider usage changes the balance. Provider-only or unavailable usage is not falsely labeled as zero.

Actual browser result: monthly/session/weekly balances were identical before and after the checklist, including invalid edits. The session meter showed **20 remaining**, and the weekly meter showed **100 remaining**. Reopening the stored chat displayed **24** zero-credit labels. Three rapid Send clicks produced one persisted user turn.

## Files changed for these two fixes

- `lib/ai/quoteDraft.ts`: editable proposals, atomic revision checks, and confirmation claim ordering.
- `lib/ai/erpIntent.ts`, `lib/ai/erpAssistant.ts`: recognize and execute edits in the current conversation; return free-response metadata.
- `lib/ai/erpAssistantClient.ts`: preserve typed response metadata.
- `lib/ai/conversationContext.ts`, `models/ai/ChatHistory.ts`: persist server-supplied zero-credit metadata on assistant turns.
- `components/ai/AiUsageIndicator.tsx`: explicit free-response label and billing explanation.
- `app/sales/ai-assistant/page.tsx`, `app/admin/ai-assistant/page.tsx`: render the label and preserve it when loading history.
- `tests/ai/quoteDraftEditing.integration.test.ts`: real disposable-Mongo regression coverage for edits, invalid values, permissions, expiry, replay, confirmation races, and real ledger/balance invariance.
- `tests/ai/usageIndicator.test.ts`: show the label only for explicit zero-credit metadata.

Pre-existing working-tree changes are preserved. No commit, push, or deployment was performed.

## Local checklist

| Group | # | Check | Status |
|---|---|---|---|
| Original | 1 | Quote draft and explicit confirmation | 🟢 |
| Original | 2 | Apply valid fractional quantity; reject excessive discount and zero quantity | 🟢 |
| Original | 3 | Specific INV-9999 not-found response | 🟢 |
| Original | 4 | Largest issued invoice; drafts excluded | 🟢 |
| Original | 5 | Overdue count from due date and outstanding balance | 🟢 |
| Original | 6 | Actual account-plan answer | 🟢 |
| Original | 7 | Authoritative session/weekly meter | 🟢 |
| Follow-up | 1 | Customer count | 🟢 |
| Follow-up | 2 | Quote count | 🟢 |
| Follow-up | 3 | Rajesh's unpaid invoices | 🟢 |
| Follow-up | 4 | Contextual total | 🟢 |
| Follow-up | 5 | SO-000019 status, linked invoice and shipment | 🟢 |
| Follow-up | 6 | Paid invoice count | 🟢 |
| Follow-up | 7 | Himalaya quotes | 🟢 |
| Follow-up | 8 | Date-bounded issued revenue; drafts excluded | 🟢 |
| Follow-up | 9 | Misspelled overdue question | 🟢 |
| Follow-up | 10 | Misspelled Rajesh payment question | 🟢 |
| Follow-up | 11 | Hinglish payment question | 🟢 |
| Follow-up | 12 | Unknown customer | 🟢 |
| Follow-up | 13 | Unknown invoice | 🟢 |
| Follow-up | 14 | Misspelled quote request | 🟢 |
| Follow-up | 15 | Safe bulk-deletion refusal | 🟢 |
| Follow-up | 16 | Free query explicitly labeled zero credits; balance unchanged (user-approved policy) | 🟢 |
| Follow-up | 17 | Error replies do not receive completed provider-answer charges | 🟢 Local invalid-edit browser checks; simulated-provider integration checks |
| Follow-up | 18 | Rapid Send clicks create one turn; no duplicate charge | 🟢 |

The two groups retain overlapping scenarios from the supplied report. Synthetic integration and browser fixtures deliberately differ for some totals; neither verifies the historical live dataset. Browser issued revenue was ₹10,40,687; the original integration fixture includes three additional special-case invoices and yields ₹10,40,987.

## Verification

| Check | Current result |
|---|---|
| Focused quote, credit, intent and conversation tests | **100 passed / 9 files; exit 0** |
| Browser checklist | **34/34 observations passed; exit 0** |
| Reopen saved chat | **24 zero-credit labels; exit 0** |
| Browser unhandled runtime exceptions | **0 captured** (does not certify every possible console/network event) |
| Full project regression suite | **2,971 passed, 9 skipped; 288 files passed, 1 skipped; exit 0** (557.37 seconds) |
| Final TypeScript check | **PASS; exit 0** |
| Final changed-source lint | **PASS; exit 0**, all 11 source/test files changed for these fixes |
| Production build | **PASS; exit 0; 553/553 pages generated**, standalone build with disposable local MongoDB |
| `git diff --check` | Passed; exit 0 |

Evidence is retained under `scratch/red-mark-fixes/`, including the browser scripts, actual responses, screenshots, balance summaries and final test logs. The browser used a dedicated local database and temporary session with external provider keys disabled. The session file was removed after use.

The first implementation test run caught a preview refactoring error (`totals` was referenced after extraction); it was fixed before the successful reruns. A subsequent attempted rerun was not executed because automatic approval review hit a usage limit. After resuming, the disposable database needed restarting; that unavailable-database run is not counted as a pass. These earlier attempts do not replace the successful final test evidence.

The nine full-suite skips are existing conditional checks (the optional dashboard Mongo integration suite and migration checks needing absent source files). They are not counted as passes.

Final local status: **25/25 supplied checklist entries green under the user-approved free-query policy**, with overlapping original/follow-up entries retained. No failures in the completed full suite or final build. Nine existing skipped tests and unverified deployment/live-provider behavior remain outside this local sign-off. The temporary browser/app and disposable MongoDB listener were stopped after verification.
