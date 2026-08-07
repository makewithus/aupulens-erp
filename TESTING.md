# Aupulens ERP — Real-Time Testing Guide

A click-by-click walkthrough to verify every implemented feature yourself
**before** handing to the test team. Follow it top to bottom — later sections
assume you've signed in from the earlier ones. Each step says **where to click**,
**what to do**, and **what you should see**.

- ⏱️ Total time: ~45–60 min for the full pass.
- 🧠 **AI note:** AI calls hit Azure OpenAI and take **~15–20 seconds** the first
  time (the endpoint is slow to wake). That's expected, not a hang.
- 🏷️ Companion doc: `SPEC_READINESS.md` (what maps to what + honest gaps).

---

## 0. Setup (2 min)

1. Start the app: `npm run dev` (or use the deployed URL).
2. Sign in at **`/auth`** with an **admin** account (admin sees the most).
3. You should land on **Admin ▸ Dashboard**. The left sidebar is your map.

> Roles to have handy for the gating tests later: one **sales**, one **hr**, one
> **finance** login. If you only have admin, you can still do everything except
> the "wrong-role can't reach it" checks in §14.

---

## 1. Multi-tenant SaaS basics (3 min)

1. Top bar → **workspace/org name**. If you belong to more than one org, the
   **workspace switcher** lets you swap — confirm data changes with the org.
2. **Admin ▸ Users** → you see only *this* workspace's users. ✅ = tenant
   isolation.
3. **Admin ▸ Settings** → change **accent branding / currency / tax (GST)**,
   save, confirm it persists on reload.
4. **Admin ▸ Settings ▸ AI preferences** → note the **AI kill-switch** and
   **model** fields (you'll use the kill-switch in §14).

---

## 2. Native AI in CRM — the 10 functionalities (10 min)

Go to **CRM** (via the sales/admin sidebar). Sign in as sales or admin.

1. **Lead scoring** — CRM ▸ Leads ▸ **create a lead** (company, a referral
   source, a budget, a note). Save. Open it → you should see a **score** and a
   short **AI reasoning** line. *(New leads get scored on save.)*
2. **Duplicate detection** — CRM ▸ Leads ▸ create another lead with a name/email
   close to an existing one (or a company like "IBM" when an
   "International Business Machines" exists). You should get a **duplicate
   warning** before it saves. The AI layer catches look-alikes, not just exact
   matches.
3. **Data completion** — open a lead that's missing fields → trigger **suggest
   values**; you get AI suggestions you can accept (it never auto-writes). Fields
   it can't infer come back blank (it won't fabricate an email).
4. **Next best action + follow-up message** — open a lead/opportunity → the
   **next-best-action** panel shows a recommendation and a **ready-to-send draft
   message**.
5. **Deal risk + win probability** — CRM ▸ Opportunities ▸ open a deal that's
   stalled/stale → you see a **risk explanation** and a **win %**.
6. **Churn risk** — CRM ▸ Accounts ▸ a high-risk account → a **retention
   suggestion**.
7. **Conversation / call-note summaries** — log a call or meeting note on a
   record → an AI **summary** is stored with it.

> Expected everywhere: AI adds insight, never blocks you. If AI is off/over-cap
> you still get a deterministic score/answer (verified in §14).

---

## 3. AI Command Center (5 min)

Open the **global command bar** (top-bar search / command entry) as admin.

1. Type **"find leads at &lt;a company you have&gt;"** → **search** results
   across modules appear.
2. Type **"explain my pipeline"** → a plain-language **explanation of your live
   pipeline numbers**.
3. Type **"create a task to call the CFO tomorrow"** → it proposes an action and
   shows a **Confirm** step. Confirm → a task is created.
4. **Safety check:** type **"delete the lead &lt;name&gt;"** → it must **stop at a
   confirm prompt** and NOT delete until you click confirm. Cancel it. ✅ =
   destructive actions are gated.

---

## 4. Module AI assistants (3 min)

Each module has an **AI Assistant** in its sidebar: **Finance, Sales, Inventory,
HR, Manufacturing**. Open one, ask a question ("summarise this month's
invoices"). You get an answer or a graceful fallback.

- **Manufacturing** specifically: start a create/update task in its assistant →
  when it's ready to act it shows an explicit **Confirm / Cancel** button bar
  (typing "yes" no longer triggers it). Click **Confirm** to execute, **Cancel**
  to abort. Your chats persist in the left history list (create a new chat, load
  an old one, archive/delete).

---

## 5. Workflow automation — two ways (6 min)

**A. Natural language** — CRM ▸ **Automations** ▸ "New rule" (or the NL box):
type **"When a new lead is created with High priority, create a follow-up task
to call them."** → it parses into a structured rule you can review → save. The
rule is created **disabled** — enable it, then create a matching lead and confirm
the task fires.

**B. Visual builder** — CRM ▸ **Workflows**: drag a **Trigger**, a **Condition**,
and an **Action** node onto the canvas, connect them, set their dropdowns, name
it, click **Publish**. It becomes the same kind of rule (check it appears in
CRM ▸ Automations). ✅ = both builders write to the same real engine.

---

## 6. Approval chains + Print-Format Builder (5 min)

**Approval chains** — CRM ▸ Quotes: create a quote with a **big discount** and
submit for approval. With a configured multi-step policy it routes step-by-step
(Manager → … → Executive), only finalizing after the **last** step. *(If no
policy is configured it uses the built-in discount tiers — still works.)*

**Print-Format Builder** — Sales ▸ **Tools ▸ Print-Format Builder**: pick a
template, change the **accent colour**, toggle **striped rows / hide HSN**, edit
the **footer note** → the **live preview updates**. Click **Save** → open a real
invoice's PDF and confirm your styling applies.

---

## 7. Smart Enterprise Calendar (3 min)

**Admin ▸ Enterprise ▸ Calendar** (also under Sales ▸ Tools and HR ▸ Reports).

1. You see a week grid with **colour-coded events** from multiple modules (tasks
   blue, leave purple, payments green, payroll amber…).
2. Click **"Detect conflicts (AI)"** → if two deadlines land on a leave day (or a
   day is overloaded), it flags them and gives an AI **prioritisation** with what
   to reschedule.

---

## 8. Enterprise Org Structure (4 min)

**Admin ▸ Enterprise ▸ Org Structure.**

1. Add a **Company** (set currency INR, timezone Asia/Kolkata, tax GST-IN).
2. Add a **Region** under it (set currency USD only). Add a **Branch**, then a
   **Department**, **Team**, **Employee** below (each parent must be a higher
   level — try adding a Company under a Team; it's **rejected** with a message).
3. Click any node → the **Consolidated report** panel shows subtree counts,
   rolled-up headcount, and **effective localization**: the Team should show
   currency **USD** (inherited from Region) but tax **GST-IN** (inherited from
   Company). ✅ = inheritance works.

---

## 9. Digital Business Twin (3 min)

**Admin ▸ Enterprise ▸ Business Twin.**

1. You see a **money-flow graph** (customers → invoices, vendors → bills) and
   **Receivable / Payable** stat cards from real data.
2. In **"Simulate a late payment"**, pick an invoice, set **days late = 30**,
   click **Simulate** → a **week-by-week cash table** shows baseline vs. late,
   with the dip highlighted and a plain-language summary.

---

## 10. Marketplace (3 min)

**Admin ▸ Enterprise ▸ Marketplace.**

1. Browse packages (filter by Workflow / Approval / Print-format). *(If empty,
   publish one first via the publish API, or seed one — see note below.)*
2. Click **Install** on a workflow package → toast confirms it installed
   **disabled**. Go to **CRM ▸ Automations** → the installed rule is there as a
   real, **editable** rule. ✅ = install creates genuine records in *your*
   workspace.

> To have something to install, an admin can publish one of their own workflows
> to the marketplace (publish is admin-only). Browsing is open to any role.

---

## 11. AI Studio + RAG (4 min)

**Admin ▸ System ▸ AI Studio.**

1. See **usage/cost analytics**, the **platform trial ceiling** bar, and the
   **model-config health check** (green = every workspace's AI model is a real
   deployed model; red lists any stale ones).
2. **Knowledge base (RAG):** click **Build / refresh index** (embeds your
   invoices + CRM notes — takes a few seconds). Then ask e.g. **"Which invoices
   are unpaid?"** → you get an answer **grounded in your data** with a note of
   which retrieval method ran (Atlas vector search or cosine fallback).

---

## 12. Universal Search (2 min)

Top-bar **global search** (any role). Type ≥2 characters of a customer, invoice
number, lead, employee, etc. → results across CRM/Sales/Inventory/HR/Projects.
Try a **natural-language phrase** ("money customers owe us") — the semantic layer
can surface invoices even with no exact keyword match.

---

## 13. Finance AI Copilot (3 min)

**Finance ▸ Overview ▸ AI Copilot** (sign in as finance or admin).

1. It **scans your invoices** and lists **anomalies** (amount outliers,
   duplicate-suspects, long-overdue) with an AI explanation of what to tackle
   first.
2. Click **Draft reminder** on any flagged invoice → an AI-drafted (or
   template-fallback) **payment-reminder email** appears for you to review. It
   **drafts, never sends**.

---

## 14. Safety & guardrail checks (5 min) — do these last

1. **AI kill-switch** — Admin ▸ Settings ▸ AI preferences → **turn AI off**. Now
   redo: a lead score (§2), a Command Center query (§3), Calendar conflict
   detection (§7), a RAG question (§11). **Every one should degrade gracefully**
   — a deterministic score, a "disabled" message, a deterministic conflict list —
   **none should error or hang**. Turn AI back **on** when done.
2. **Destructive confirm gates** — reconfirm §3.4 (Command Center delete stops at
   confirm) and §4 (Manufacturing Confirm/Cancel buttons).
3. **Wrong-role gating** (needs a non-admin login) — as a **sales** user, try to
   open **`/admin/org-structure`**, **`/admin/business-twin`**, or
   **`/admin/ai-studio`** by typing the URL → you should be **redirected/blocked**,
   not shown the page. As a **hr** user, `/sales/print-format-builder` should be
   blocked. Calendar and Marketplace are intentionally open to all logged-in
   roles.
4. **Broken session** (optional) — if you can clear just the tenant from your
   session, protected pages show an **empty state**, not a crash or infinite
   spinner.

---

## What NOT to test (out of scope / deferred — see `SPEC_READINESS.md`)

- **Desktop `.exe` client** — parked; not part of this handoff.
- **Google/Microsoft OAuth sign-in** — needs live app credentials; email login
  works.
- **Razorpay/Stripe/WhatsApp Business/Slack/Teams integrations** (Aupulens
  Connect), **Tally/SAP/Oracle ERP migration connectors**, **Document
  Intelligence OCR** — credential-gated, documented in `SETUP_INTEGRATIONS.md`,
  intentionally not built yet.
- **Role-Based Workspaces** deep per-role KPI personalization and an arbitrary
  **custom-form designer** are basic (🟡), not full-depth — don't file these as
  bugs; they're known partials.

---

## If something breaks

- Note the **exact page**, **role**, **what you clicked**, and any **browser
  console** error.
- AI taking ~15–20s on first call is **normal**, not a bug.
- A red banner about "subscription inactive" means the test org's trial date —
  not a feature bug.
