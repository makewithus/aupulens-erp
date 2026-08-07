# Aupulens ERP — Spec Readiness Matrix (for the Test Team)

This is a line-by-line map of the CTO feature spec to what's actually in the
running application, **written to be used by navigation** — every ✅ row tells
you exactly where to click. It was produced during a dedicated pre-QA pass
(2026-08-07) in which every ✅ was re-verified *after* all prior changes (the
tenant-guard hardening touched 118 files), not copied forward.

**How to read Status:** ✅ working · 🟡 partial (what's missing is stated) ·
❌ not built (deferred, why stated) · **N/A** desktop (parked this pass).

**Test accounts:** sign in per role (admin, sales, finance, hr, inventory,
manufacturing, project). Admin sees the most. A companion **`TESTING.md`** gives
a click-by-click walkthrough; this file is the coverage map.

> **Verification legend in the last column:** "Build" = compiles + renders in
> `next build`; "Suite" = automated test; "Live script" = a real run against the
> live database (`scripts/verify-*.ts`); "Cross-feature" = the integration pass
> (`scripts/verify-cross-feature.ts`); "Nav" = reachable + role-gated confirmed
> this pass.

---

## A. Native ERP AI Functionalities (AI assists, never overrides)

| Spec item | Status | Where to find it (click path) | Verified this pass |
|---|---|---|---|
| Lead scoring suggestions | ✅ | CRM ▸ Leads ▸ open a lead — score + AI reasoning shown | Live script + Cross-feature (falls back when AI off) |
| Next best action recommendations | ✅ | CRM ▸ Leads/Opportunities ▸ open a record | Live script (`verify-native-ai`) |
| Deal risk detection | ✅ | CRM ▸ Opportunities ▸ open a flagged deal — AI risk note | Live script |
| Conversation summaries | ✅ | CRM ▸ log a call/meeting note on a record | Live script |
| Call note summaries | ✅ | Same path as conversation summaries | Live script |
| Suggested follow-up messages | ✅ | CRM ▸ Leads/Opportunities ▸ Next-best-action panel (draft message) | Live script |
| Opportunity win probability | ✅ | CRM ▸ Opportunities ▸ open a deal — win % (AI on flagged deals) | Live script |
| Churn risk warnings | ✅ | CRM ▸ Accounts ▸ high-risk account — retention note | Live script |
| Duplicate detection assistance | ✅ | CRM ▸ create a Lead/Contact that resembles an existing one → dedup prompt (catches semantic dupes e.g. "IBM" = "International Business Machines") | Live script |
| Data completion suggestions | ✅ | CRM ▸ Leads ▸ a lead with gaps → "suggest values" (never auto-writes) | Live script |

All 10 fall back to a deterministic result when AI is disabled/over-cap (proven
in the cross-feature pass) — the "assist, not override" requirement.

---

## B. NEW FEATURES (top-level deliverables)

| Deliverable | Status | Where | Verified |
|---|---|---|---|
| SaaS Platform Integration | ✅ | see section 1 below | Suite + Live |
| AI Native ERP System | ✅ | see section 2 below | Suite + Live |
| Invoice Template Engine | ✅ | Sales ▸ Invoices ▸ Templates (gallery, choose + preview); Sales ▸ Tools ▸ Print-Format Builder (customise + live preview); invoice PDF + WhatsApp signed-link share | Build + Live script |
| Desktop Client (.exe) | **N/A** | Parked this pass by instruction — build-script fixes done; icon + `API_BASE_URL` wiring documented as open. Not tested here. | — |

---

## 1. SaaS Platform Integration

| Spec bullet | Status | Where | Verified |
|---|---|---|---|
| Multi-Tenant Architecture (isolation of users/data/AI memory) | ✅ | Automatic per subdomain; every record scoped by tenant. Hardened this rollout — a session with no tenant now **hard-fails (401)** instead of silently reading a shared bucket. | Suite (`requireTenantId`, `chatHistoryIsolation`) + Live |
| Organization Management (create/join org, permissions, switch workspace) | ✅ | Sign-up / accept-invite flow; workspace switcher in the top bar; Admin ▸ Users for permissions | Suite |
| Subscription System (Starter/Professional/Enterprise tiers → user counts, AI limits, module access) | ✅ | Tier gating enforced in middleware; AI monthly cap per tier + a platform-wide `AI_GLOBAL_MONTHLY_CAP` trial ceiling above it | Suite (`aiLimits`, `aiSafetyGuards`) + Live |
| Authentication & Billing — Email login | ✅ | `/auth` sign-in (email + password) | Suite |
| Authentication — Google / Microsoft OAuth | 🟡 | Buttons appear **only when** Google/MS app credentials are configured server-side. Code path complete; **live sign-in not testable here** (needs real Google/MS app credentials — flagged to product owner). | Build |
| Billing — subscription tracking + payment history | 🟡 | Admin ▸ System ▸ Billing (history UI live). Live card payments (Razorpay) are **deferred/credential-gated** — see `SETUP_INTEGRATIONS.md`. | Build |
| Workspace Settings (branding, tax/GST, currency, AI preferences) | ✅ | Admin ▸ Settings (branding, tax/GST, currency); AI preferences (model/kill-switch/token cap) there too | Build + Live |

---

## 2. AI Native ERP System

| Spec bullet | Status | Where | Verified |
|---|---|---|---|
| Natural-language **text** input | ✅ | Global Command Center (⌘/Ctrl-K style bar) + each module's AI Assistant | Live script (`verify-command-intents`) |
| **Voice** commands | ✅ | Voice notes / mic button (uses the browser's built-in speech recognition) | Build |
| AI Command Center — search data | ✅ | Command bar ▸ "find leads at Nimbus" → real cross-module results | Live script |
| AI Command Center — explain reports | ✅ | Command bar ▸ "explain my pipeline" → grounded explanation of live numbers | Live script |
| AI Command Center — automate workflows | ✅ | Command bar ▸ "create a task…" / "delete the lead…" → **confirm-gated** executor | Live script (destructive action stops at confirm) |
| Module Operations — Accounting (vouchers/GST) | ✅ | Finance ▸ AI Assistant + Finance module | Suite |
| Module Operations — Sales (quotations) | ✅ | Sales ▸ AI Assistant; CRM ▸ Quotes | Suite |
| Module Operations — CRM (leads) | ✅ | CRM ▸ Leads + AI | Suite + Live |
| Module Operations — Inventory (stock) | ✅ | Inventory ▸ AI Assistant | Suite |
| Module Operations — HR (payroll) | ✅ | HR ▸ Payroll + AI | Suite |
| Module Operations — Projects | ✅ | Projects module | Build |
| Automation — natural-language workflow creation | ✅ | CRM ▸ Automations ▸ describe a rule in English → parsed, reviewed, saved, **executes** | Live script (`verify-nl-rule` end-to-end) |
| Insights — automated business-health summaries + revenue forecast | ✅ | Admin dashboard health summary (cron-generated); low/no-data tenant gets an honest "not enough data" message | Live script (`verify-nl-rule` low-data path) |
| Memory & Safety — isolated AI memory per business | ✅ | Chat history is scoped by tenant + module (a workspace can't see another's) | Suite (`manufacturingChatHistory`, `chatHistoryIsolation`) + Live |
| Memory & Safety — mandatory confirmation for destructive/financial ops | ✅ | Finance AI actions + Command Center executor + Manufacturing assistant all require an explicit **Confirm** click (Manufacturing now a real button, not keyword-matched) | Live script (`verify-command-executor`) |

---

## 4. Desktop Client — **N/A (parked)**

Excluded from this pass by instruction. Status unchanged: build-script fixes
done; icon asset + `API_BASE_URL` architectural gap documented; not tested.

---

## 5. Expansion Modules

| # | Module | Status | Where | Verified |
|---|---|---|---|---|
| 1 | Universal ERP Migration Platform | 🟡 | **Baseline present:** generic CSV/XLS import (CRM ▸ Import). **Deferred:** the named connectors (Tally, SAP, Oracle NetSuite, Dynamics, Zoho, ERPNext, Odoo, Busy, Marg, QuickBooks) and AI-assisted field mapping are **not built** — Tally's XML path is documented and needs real sample exports (`SETUP_INTEGRATIONS.md`). | Docs |
| 2 | Aupulens Connect (integration platform) | ❌ (deferred) | **Credential-gated, documented not built.** Razorpay + WhatsApp seams exist and are documented in `SETUP_INTEGRATIONS.md`; the broader iPaaS (Stripe, Slack, Teams, Shopify, Amazon, couriers, SDKs) is future scope. | Docs |
| 3 | Enterprise Organization Management (8-level hierarchy, localized settings, consolidated reporting) | ✅ | **Admin ▸ Enterprise ▸ Org Structure** — build Company→…→Employee, per-node currency/language/timezone/tax with inheritance, subtree consolidated report | Live script (`verify-org-hierarchy`) + Suite + Nav |
| 4 | Smart Enterprise Calendar (holistic integration + AI scheduling) | ✅ | **Admin ▸ Enterprise ▸ Calendar** (also Sales ▸ Tools, HR ▸ Reports) — unified tasks/leave/attendance/payments/payroll + "Detect conflicts (AI)" | Live script (`verify-calendar`, 508 real events) + Cross-feature + Nav |
| 5 | Visual ERP Builder (drag-and-drop, triggers/actions, templates) | ✅ | **CRM ▸ Workflows** — React Flow canvas over the real automation engine; **CRM ▸ Automations** is the form/list alternate | Live script (`verify-nl-rule`, same backend) + Suite + Nav |
| 6 | AI Studio (agent config, RAG knowledge base, cost analytics, governance) | ✅ | **Admin ▸ System ▸ AI Studio** — usage/cost analytics, model-config health check, platform ceiling, and **scoped RAG** (Build index → ask a question grounded in your invoices + CRM notes). Multi-agent orchestration is a documented future increment. | Live script (`verify-rag`) + Suite + Nav |
| 7 | Universal Enterprise Search (natural-language, broad reach) | ✅ | Top-bar global search (all roles) — keyword across CRM/Sales/Inventory/HR/Projects, **semantic** layer on top (finds records sharing no keyword) | Live script (`verify-semantic-search`) + Suite |
| 8 | AI Copilot (explain, detect anomalies, forecast, summarize, draft, execute w/ approval) | ✅ | **Finance ▸ Overview ▸ AI Copilot** — anomaly scan (with AI explanation) + "Draft reminder" per flagged invoice; report-explain in Command Center; summaries in CRM; execute-with-approval via the confirm-gated executor | Live script (`verify-finance-ai`) + Suite + Nav (page added this pass) |
| 9 | Role-Based Workspaces (tailored dashboards/KPIs/AI per role) | 🟡 | **Present:** each role has its own dashboard + sidebar + module gating (Admin/Finance/Sales/HR/Inventory/Manufacturing/Projects). **Partial:** deeply role-tailored KPI widgets + per-role AI recommendation feeds are basic, not the full "CFO vs Warehouse" personalization. | Build + Nav |
| 10 | Low-Code Customization Platform (forms, fields, approval workflows, layouts, print formats) | ✅ (mostly) | **Approval workflows:** configurable multi-step chains (built this rollout). **Print/report formats:** Sales ▸ Tools ▸ Print-Format Builder. **Visual layouts:** Visual Builder. **Custom fields:** a custom-fields drawer exists in Sales (payments). Full arbitrary custom-**form** designer is partial. | Live script (`verify-approval-chain`) + Suite |
| 11 | Marketplace (publish/sell templates, agents, extensions) | ✅ | **Admin ▸ Enterprise ▸ Marketplace** — browse + install workflow / approval-policy / print-format packages (installs create real, editable, disabled records in your workspace). Publish + paid monetization/sale is future scope; publish API exists (admin). | Live script (`verify-marketplace`) + Cross-feature + Nav |
| 12 | Document Intelligence (OCR extraction, auto record creation) | ❌ (deferred) | **Credential-gated, documented not built** — needs an Azure Document Intelligence resource (`SETUP_INTEGRATIONS.md`). CRM's non-OCR duplicate detection exists separately. | Docs |
| 13 | Digital Business Twin (relationship graph + simulation) | ✅ (scoped) | **Admin ▸ Enterprise ▸ Business Twin** — real Customer→Invoice / Vendor→Bill money-flow graph + **one** cash-flow simulation ("what if invoice X pays N days late?"). Broader "predict every bottleneck / optimize supply chain" is intentionally not claimed. | Live script (`verify-twin`) + Nav |

---

## Known issues / not launch-ready (short by design)

1. **OAuth (Google/Microsoft) live sign-in** — code complete, **not testable
   without real Google/Microsoft app credentials** (needs product owner). Email
   login works.
2. **Credential-gated modules** (correctly deferred, documented in
   `SETUP_INTEGRATIONS.md`): Aupulens Connect / Razorpay-Stripe-WhatsApp (6.7),
   Tally & broader ERP migration connectors (6.9/module 1), Document
   Intelligence OCR (6.4/module 12). No code work until credentials/sample data
   exist.
3. **Role-Based Workspaces (module 9)** and **arbitrary custom-form designer
   (part of module 10)** are functional-but-basic (🟡), not the full spec depth.
4. **Desktop client** — parked, untouched, out of scope for this handoff.

Everything else in the table is ✅ and reachable by the navigation paths above,
re-verified this pass. Automated suite: **868 passing**; `tsc`/`eslint` clean;
`next build` green.
