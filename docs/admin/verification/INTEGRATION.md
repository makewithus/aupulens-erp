# INTEGRATION.md — seam proofs (Phase 9 Part 3.2)

> Started ahead of the full Part 5 pass because one finding below (the `vercel.json` cron
> discrepancy) needed to be captured the moment it was confirmed, not held until a later report.
> The remaining seams in the Part 3.2 table are still to be proven — this file will grow to cover
> all of them before the final Phase 9 report.

## `vercel.json` — CONFIRMED: 8 pre-existing, non-platform cron jobs are not registered, and have not been since 2026-09-05

**This is a real, out-of-scope-to-fix, in-scope-to-flag production concern**, not a discrepancy
between documentation and code — it is a discrepancy between what production is scheduled to run
and what the codebase's own cron routes assume is running them.

**Evidence**: `git log --all -- vercel.json` shows a commit titled **"Cron is removed"**
(`b7fcdee7`, 2026-09-05 22:56:50, authored by the project's own account, not any AI session —
predates this entire Global Admin project) whose diff replaces the full `crons` array with `{}`:

```diff
-{
-  "crons": [
-    { "path": "/api/cron/crm/automations", "schedule": "0 3 * * *" },
-    { "path": "/api/cron/crm/contract-check", "schedule": "0 4 * * *" },
-    { "path": "/api/cron/crm/sla-check", "schedule": "0 * * * *" },
-    { "path": "/api/cron/sales/reminders-evaluation", "schedule": "0 5 * * *" },
-    { "path": "/api/cron/sales/subscriptions-billing", "schedule": "0 6 * * *" },
-    { "path": "/api/cron/business-health", "schedule": "0 7 * * *" },
-    { "path": "/api/cron/ai/runtime-sweep", "schedule": "0 * * * *" },
-    { "path": "/api/cron/ai/metrics-snapshot", "schedule": "0 2 * * *" }
-  ]
-}
+{}
```

**What this means, if this file is what's actually deployed to Vercel**: none of these 8 jobs has
run on a schedule since 2026-09-05 — CRM automations, contract expiry checks, SLA checks, sales
payment reminders, subscription billing runs, business-health summaries, and both AI-runtime
scheduled jobs. The route handlers behind all 8 paths still exist in the codebase (confirmed —
none were deleted, only their schedule registration was) — so this is a **scheduling gap**, not a
feature removal; anything depending on one of these running automatically has silently stopped,
while everything that depends on the routes existing and being callable (e.g. manually, or via a
different trigger) is unaffected.

**Not fixed here.** Restoring 8 unrelated tenant-facing cron schedules is outside this phase's
mandate (the Global Admin control plane) and is exactly the kind of infrastructure change that
needs the person who removed them to confirm whether it was intentional (a deliberate pause during
some other work) or an accident that was never reverted. **Flagged for the user's direct attention**
— this is the single most actionable finding in Phase 9's entire integration review, because unlike
everything else in this document, it may already be costing real, silent function loss in
production today.

**What Phase 9 DID add**: one new entry, `/api/cron/platform/ai-cost-spike-check` (daily, source doc
§28's AI-cost-spike alert condition) — this project's own new cron, registered correctly, additive
to whatever the eventual resolution of the 8 missing entries turns out to be.

---

*(The remaining Part 3.2 seams — `middleware.ts`, `auth.ts`, `Organization` additive fields,
`isActive`, `SubscriptionEvent`, `lib/ai/tenantAi.ts`, `lib/ai/claude.ts`, `lib/constants/tiers.ts`,
`ActivityLog` — are proven in each phase's own verification document already
(`docs/admin/verification/*.md`) but have not yet been consolidated into one seam-by-seam table
here. That consolidation is still outstanding, tracked under Phase 9 Part 5.)*
