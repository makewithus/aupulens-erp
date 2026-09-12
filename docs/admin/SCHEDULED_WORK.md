# SCHEDULED_WORK.md — is each job's absence incorrect, or merely stale?

> Phase 10 Part 0.4: *"the single best piece of design in this project is already the model here —
> `getActiveAccessGrant()` checks expiry live at read time, so an access grant expires correctly
> whether or not the cron ran."* Applying that standard to each of the 12 jobs now served by
> `lib/platform/scheduler/` instead of Vercel Cron (`docs/admin/CRON_INCIDENT.md`).

**Merely stale** = if this job never runs again, every number and status shown anywhere remains
*honestly labelled as of its last computation* — nothing is silently wrong, only out of date.
**Incorrect** = something would be displayed or enforced as if current/true when it is not, with no
indication that it's stale — a real correctness bug, not just a delay.

| Job | If it never runs again | Verdict |
|---|---|---|
| `crm-automations` | Cold-lead/stuck-deal notifications fire late, not wrongly — the underlying condition (`last_contact_date <= 7 days ago`, etc.) is re-evaluated fresh from real data the next time it *does* run, nothing is cached incorrectly. | **Merely stale** |
| `crm-contract-check` | Renewal tasks are created late. The contract's own `end_date` and `status` fields are always real; only the reminder timing slips. | **Merely stale** |
| `crm-sla-check` | **Flagged, not fixed in this pass.** `CrmCase.sla_breached` is a stored boolean this job flips — if any CRM UI trusts that field as "is this case currently breached" without also comparing `sla_target_at` to now, a case that breached after the last sweep would display as "not breached" when it actually is. That is a real correctness gap by this document's own standard, not merely a delay. Fixing it properly means computing breach status live wherever it's displayed in CRM's own case UI — outside the Global Admin control plane's surface, and a large enough change to CRM's own read paths that it deserves its own scoped pass rather than a rushed patch inside this phase. Recorded here and in the QA known-limits section rather than silently left unflagged. | **Incorrect (identified, not fixed here)** |
| `sales-reminders-evaluation` | Payment reminders (an external notification to a customer) go out late. Nothing internal is displayed incorrectly. | **Merely stale** |
| `sales-subscriptions-billing` | Billing runs are delayed — real, consequential (delayed revenue capture), but no stored field or displayed number becomes *wrong*; a subscription's own `nextBillingDate` field stays accurate regardless of whether the run happened. | **Merely stale (consequential)** |
| `business-health` | The AI business-health summary is generated late. Any UI showing it already shows its own `generatedAt` timestamp (pre-existing field), so staleness is visible, not hidden. | **Merely stale** |
| `ai-runtime-sweep` | The AI runtime dispatches most events **inline, synchronously, at emit time** (`lib/aiRuntime/runtime/eventBus.ts` — confirmed by reading the emit path, not assumed) — this sweep is the retry-with-backoff backstop for whatever failed inline, plus the hourly/period-horizon triggers. Only the backstop and the periodic re-checks are delayed; the primary, event-driven path is unaffected. | **Merely stale** |
| `ai-metrics-snapshot` | Workflow-drift detection is delayed — an observability signal, not something any dashboard number depends on. | **Merely stale** |
| `platform-ai-usage-rollup` | **Fixed in this pass.** The AI usage dashboards (`lib/platform/ai/dashboard.ts`, `getOrganizationAiUsage()`) read `AiUsageMonthly`/`AiUsageDaily` — rows this job writes. Without it, those rows silently stop advancing while the dashboard keeps rendering them as if current: a genuinely wrong number shown with total confidence, exactly the failure mode Part 0.2 called out for the demo. **Fix**: both dashboard reads now check whether the relevant rollup period is stale (no row for the expected day/month) and, if so, compute the same aggregate directly from `AiUsageRecord` instead — and report which source was used (`"rollup"` or `"live"`) so the distinction is never hidden. | **Incorrect → fixed** |
| `platform-retention-sweep` | Audit records past their retention period aren't deleted promptly. No stored value becomes wrong (an audit row that should have been deleted but wasn't is still a *true* record of what happened) — this is a compliance/storage concern, not a correctness one. | **Merely stale** |
| `platform-access-session-expiry` | **Already correct by design**, and the model for this whole exercise: `getActiveAccessGrant()` (`lib/platform/access/status.ts`) checks `expiresAt < now` live, every time, regardless of whether this job has run. The job only tidies the stored `status` field for reporting — it was never the enforcement boundary. | **Already correct — no change needed** |
| `platform-ai-cost-spike-check` | The alert simply doesn't fire on time. No KPI or dashboard number is affected — this job only ever *creates an alert*, it never renders a value anywhere else. | **Merely stale** |

## Summary

Of 12 jobs, **10 are merely stale** (a real functional delay in some cases, but never a
misleading number), **1 was already correct by design** (the model this whole document measures
against), and **1 was genuinely incorrect and has been fixed** (the AI usage rollup → dashboard
fallback). **1 more incorrect case was found and flagged, not fixed** (CRM SLA breach display) —
recorded honestly rather than silently left off this list, per Phase 10's own standard that nothing
gets quietly dropped.
