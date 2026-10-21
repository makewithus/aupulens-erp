# Plan-based AI credit rules

AI credits are usage units, not a fixed deduction per message. The server estimates a request before calling the provider, reserves that amount against every applicable plan bucket, then replaces the reservation with the settled usage after success. A provider/infrastructure failure refunds the reservation. A request ID is unique per tenant, so retries cannot create a second charge.

## Default plan allowances

| Plan | Per session (5 hours) | Per week (7 days) | Per month (UTC calendar month) |
|---|---:|---:|---:|
| Free / trial | 20 | 100 | 500 |
| Starter | 20 | 100 | 1,000 |
| Growth | 50 | 250 | 1,500 |
| Pro | 100 | 500 | 2,500 |
| Business | 250 | 1,500 | 6,000 |
| Enterprise | 500 | 3,000 | 12,000 |
| Custom | Based on Business; editable | Based on Business; editable | Based on Business; editable |

Plan defaults live in `lib/platform/entitlements/planCatalog.ts`. Platform admins can edit the limits on the Plans page; a tenant-specific entitlement override can be used for negotiated limits. The monthly, session, and weekly caps all apply, so a request must have estimated headroom in all three.

## How a unit is calculated

For each provider request, the model's configured `AiCostRate` calculates USD from input and output tokens. The USD amount is divided by `AI_CREDIT_USD_VALUE` (default `$0.01` per unit) and rounded up to four decimal places. A configured per-request backend allowance and per-tool-call allowance are added in units. They are controlled by `AI_BACKEND_CREDITS_PER_REQUEST` and `AI_TOOL_CALL_CREDITS`; both default to zero until an operator chooses the appropriate rates. Callers that execute tools can provide estimated and actual tool-call counts to the tenant AI wrapper.

Example with the defaults above: if a request's model usage costs `$0.005`, it uses `0.5` units before optional backend or tool charges. An analysis that consumes more tokens costs more units than a short answer. The actual provider token counts replace the estimate after success.

## Reset and reporting rules

- Session windows are aligned to five-hour UTC boundaries.
- Weekly windows run Monday 00:00 UTC to the next Monday 00:00 UTC.
- Monthly credit windows follow UTC calendar months.
- Reserved amounts count against availability immediately; the footer reports used, pending, remaining, and the exact next reset.
- The plan limit update is enforced on new requests, including when an administrator lowers a limit. Already-settled usage is retained.

Plan catalogue defaults are code configuration. Old plan rows lacking the new session/week fields use their plan catalogue defaults at runtime. Persisted monthly values remain authoritative until the catalogue is reseeded or an admin edits the plan. To apply the new monthly defaults to a database, run `npx tsx scripts/seed-platform-plans.ts` only in the intended environment after reviewing its `MONGODB_URI`; this audit did not run the seed or write to any database.
