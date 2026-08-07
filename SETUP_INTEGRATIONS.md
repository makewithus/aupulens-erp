# External Integrations & Scheduling Setup

Companion to `SETUP_AI.md` (Azure OpenAI). Covers the non-AI external
services and scheduling the app now depends on, and what each still needs to
go fully live. Same style: what it is, where to get credentials, which env
vars, how to verify.

> **Re-confirmed current (2026-08-07).** The credential-gated integrations
> below — 6.4 Document Intelligence/OCR, 6.7 Razorpay + WhatsApp Business API,
> 6.9 Tally — remain accurately documented and correctly deferred (no code work
> without the credentials). Every "seam" referenced here was re-verified to
> still exist after the AI-scope and hardening/expansion work:
> `lib/crm/automationEngine.ts` still has the `send_whatsapp` action case,
> `lib/billing/appendSubscriptionEvent.ts` + `/admin/billing`,
> `lib/sales/paymentGateway.ts` / `paymentGatewayService.ts` stubs,
> `app/api/crm/import`, and Cloudinary uploads (`lib/upload.ts`). Env-var names
> are unchanged and don't collide with anything added since.

---

## 1. Scheduled jobs (Cron)

The app has scheduled work (CRM automations, contract/SLA checks, invoice
reminders, subscription billing + dunning, and the daily AI business-health
summary). Before this rollout **nothing scheduled these** — the routes
existed but were never invoked.

**On Vercel:** a `vercel.json` at the repo root now declares the schedule for
all of them. Vercel Cron sends a **GET** with an `Authorization: Bearer
<CRON_SECRET>` header automatically when the `CRON_SECRET` env var is set — so:

- Set `CRON_SECRET` in the Vercel project's environment variables (any strong
  random string).
- Note: Vercel's Hobby plan limits cron frequency (roughly once/day); the
  `sla-check` job is declared hourly and needs a Pro plan to run that often —
  adjust the schedules in `vercel.json` to your plan.

**On any other host (Render, Railway, self-hosted, etc.):** `vercel.json` does
nothing there. Point that platform's own scheduler (or an external cron
service like cron-job.org / EasyCron / a GitHub Action) at each URL below,
sending the header `Authorization: Bearer <CRON_SECRET>`:

| URL | Suggested cadence |
|---|---|
| `/api/cron/crm/automations` | daily |
| `/api/cron/crm/contract-check` | daily |
| `/api/cron/crm/sla-check` | hourly |
| `/api/cron/sales/reminders-evaluation` | daily |
| `/api/cron/sales/subscriptions-billing` | daily |
| `/api/cron/business-health` | daily |

Each route accepts both GET and POST. **Verify:** `curl -H "Authorization:
Bearer $CRON_SECRET" https://<host>/api/cron/crm/contract-check` should return
`{"success":true,...}`; a wrong/missing secret returns 401.

---

## 2. Razorpay (payments) — *implemented against the API, needs live keys*

Status: **Phase 6.7 is documented/deferred, not yet built** (see `PROGRESS.md`).
When it's built, it will need:

- A [Razorpay](https://razorpay.com) account → Dashboard → Settings → API Keys.
- Env vars: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`
  (for verifying webhook signatures).
- A webhook configured in the Razorpay dashboard pointing at
  `/api/webhooks/razorpay` with the events you care about (`payment.captured`,
  `payment.failed`, etc.). The handler must verify the `X-Razorpay-Signature`
  HMAC against `RAZORPAY_WEBHOOK_SECRET` before trusting the payload, and on
  a successful payment call the existing `appendSubscriptionEvent()` helper
  (`lib/billing/appendSubscriptionEvent.ts`) with a `payment_succeeded` event
  so it flows into the billing-history UI that already exists (`/admin/billing`).
- **Verify:** use Razorpay test-mode keys + the dashboard's "test webhook"
  button; a captured test payment should appear in `/admin/billing`.

Note: `lib/sales/paymentGateway.ts` / `paymentGatewayService.ts` already exist
as honest stubs with `TODO: replace with real per-gateway API clients` — that
is the seam to build the Razorpay client into.

---

## 3. WhatsApp Business API (real messaging) — *deferred*

Status: **Phase 6.7 deferred.** Today the app shares invoices via a `wa.me`
link (now a real signed public link the recipient can open — Phase 5). A true
WhatsApp *Business API* send (automated, template-based, no human tapping
"send" in their own WhatsApp) would need:

- A Meta/Facebook Business account with WhatsApp Business Platform access, a
  registered phone number, and pre-approved message templates.
- Env vars: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_BUSINESS_ACCOUNT_ID`, and `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- Sends go to `https://graph.facebook.com/v20.0/<PHONE_NUMBER_ID>/messages`
  with the access token; inbound status/replies arrive at a webhook you'd add
  at `/api/webhooks/whatsapp` (verified via the verify token).
- **Verify:** send a template message to a test number registered with your
  WhatsApp Business account.

The CRM automation engine already has a `send_whatsapp` action case
(`lib/crm/automationEngine.ts`) that currently just logs an activity — that's
the seam to plug a real send into.

---

## 4. Tally Prime connector (ERP migration) — *deferred*

Status: **Phase 6.9 deferred.** Tally Prime exchanges data over XML — either
exported `.xml` files or its HTTP XML gateway (Tally running with "Enable ODBC/
XML" on a LAN port, default 9000). A real connector would:

- Parse Tally's master/voucher XML (`<ENVELOPE>` → `<TALLYMESSAGE>` with
  `<LEDGER>`, `<VOUCHER>` etc.) and map ledgers→accounts, vouchers→journal
  entries, stock items→inventory items.
- Need no cloud credentials, but does need real sample Tally exports to build
  and verify the field mapping against (Tally's XML is idiosyncratic and
  version-dependent) — that's the "real file format edge cases you can't test
  without a real Tally export" the phased plan flagged as a legitimate reason
  to implement-and-document rather than claim done.

The existing generic CSV/XLS importer (`app/api/crm/import`, etc.) is the
pattern to extend; a Tally importer would add an XML parse step + the
ledger/voucher mapping in front of the same "create records" tail.

---

## 5. Azure Document Intelligence (OCR) — *deferred*

Status: **Phase 6.4 deferred.** Natural fit given the Azure account already
in use for AI. Would need an Azure "Document Intelligence" (formerly Form
Recognizer) resource → Keys and Endpoint:

- Env vars: `AZURE_DOC_INTELLIGENCE_ENDPOINT`, `AZURE_DOC_INTELLIGENCE_KEY`.
- Use the prebuilt `prebuilt-invoice` / `prebuilt-document` models to extract
  fields from uploaded invoices/POs, then map to the app's invoice/PO models.
  Cloudinary (already wired for uploads) can store the source file.
- **Verify:** POST a sample invoice PDF; confirm extracted vendor/total/line
  items come back before wiring auto-record-creation.
