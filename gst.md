# GST Prefill — Getting the API Key (`GST_API_KEY`)

## Why this is needed

On **Sales → Customers → New**, the "Prefill from GST portal" action takes a GSTIN and fills the customer form.

| What | Works today (no key) | Needs the key |
|---|---|---|
| GSTIN format + check-digit validation | ✅ | |
| State (from the first 2 digits) | ✅ | |
| PAN (characters 3–12) | ✅ | |
| Business type (Company / Individual / Firm…) | ✅ | |
| **Legal name, trade name** | | ✅ |
| **Registered address (street, city, PIN)** | | ✅ |
| **Registration status (Active / Cancelled)** | | ✅ |

The GST portal itself is captcha-protected and has **no public API**, so the live data has to come from a GST-verification provider. The code (`lib/sales/gstinLookup.ts`) is written for **Appyflow** (https://appyflow.in). Once the key is in the environment, prefill starts returning the full data with no code change.

Test GSTIN for QA: `32AAVCM0878J1ZX` (MAKEWITHUS).

---

## Part 1 — Create the Appyflow account and key

> The provider's screens can change slightly. If a button is named differently, look for the closest match — the goal is to end up with a **"Key Secret"** for the **GST verification** API.

1. Open **https://appyflow.in** in a browser.
2. Click **Sign Up / Register** (top right).
3. Register with the **company email** that should own the account (use a shared/company mailbox such as `tech@makewithus.in`, not a personal one, so access isn't lost if someone leaves).
4. Verify the email (click the link Appyflow sends) and, if asked, verify the mobile number with the OTP.
5. Log in and open the **Dashboard**.
6. Find the **API / Key Secret** section (usually a card showing "Key Secret" or under *Settings → API Keys*).
7. Click **Copy** on the **Key Secret**. Treat it like a password.
8. Check the **plan / credits** on the dashboard:
   - A free/trial plan usually gives a small number of lookups — enough for QA.
   - For production use with real customers, pick a paid plan sized to your expected number of customer-creations per month. (Each prefill click = 1 lookup.)
9. Make sure **GST Verification / "GST Search"** is enabled on your plan (some plans list the APIs individually).

## Part 2 — Test the key BEFORE putting it in the app

Run this in a terminal (replace `YOUR_KEY`):

```bash
curl "https://appyflow.in/api/verifyGST?gstNo=32AAVCM0878J1ZX&key_secret=YOUR_KEY"
```

**Good response** (shape — values will be real):

```json
{
  "error": false,
  "taxpayerInfo": {
    "gstin": "32AAVCM0878J1ZX",
    "lgnm": "…legal name…",
    "tradeNam": "…trade name…",
    "sts": "Active",
    "pradr": { "addr": { "bno": "…", "st": "…", "loc": "…", "dst": "…", "stcd": "Kerala", "pncd": "…" } }
  }
}
```

If you see `"error": true`, read the message:

| Message / symptom | Meaning | Fix |
|---|---|---|
| Invalid key / unauthorized | Key copied wrongly or not activated | Re-copy the key, no spaces |
| Credits exhausted / plan expired | No lookups left | Recharge / upgrade the plan |
| GSTIN not found | GSTIN doesn't exist or was typed wrong | Try another GSTIN |
| Empty reply / timeout | Provider or GST portal is down | Retry later |

Send me the **shape of the response only** (never the key) if it differs from the above — the mapping in `lib/sales/gstinLookup.ts` may need a small tweak.

## Part 3 — Put the key in the app

**Never commit the key to git and never paste it in chat/screenshots.**

### Local development
1. Open `Aupulens-ERP-main/.env` (it is git-ignored).
2. Add:
   ```
   GST_API_KEY=paste_the_key_secret_here
   ```
3. Stop the dev server (Ctrl+C) and start it again: `npm run dev`. Environment variables are read only at startup.

### Production (Vercel)
1. Vercel → your project → **Settings → Environment Variables**.
2. **Add New**: Name `GST_API_KEY`, Value = the key.
3. Tick the environments that need it (**Production**, and **Preview** if testers use previews).
4. **Save**, then **redeploy** (Deployments → the latest → ⋯ → *Redeploy*). Variables only apply to new deployments.

### Optional
`GST_API_URL` — only if you switch to a different endpoint. The default is `https://appyflow.in/api/verifyGST`. Leave it unset for Appyflow.

## Part 4 — Verify inside the app

1. Sales → Customers → **New**.
2. Enter `32AAVCM0878J1ZX` in the GSTIN box and click **Prefill**.
3. Expected: a green toast **"Customer details filled from the GST portal"**, and these fields populated:
   - Customer type = Business
   - Company name / Display name
   - Billing address (street, city, state = Kerala, PIN)
   - PAN = `AAVCM0878J`
4. If you instead see the blue message *"State, PAN and business type were filled… need a GST API key"*, the key isn't reaching the server (typo in the variable name, server not restarted, or Vercel not redeployed).
5. If you see *"The GST service didn't respond…"*, the key is set but the provider returned an error — repeat the `curl` test in Part 2.

## Security & cost notes

- The key is used **server-side only** (`app/api/sales/customers/gstin-lookup`). It is never sent to the browser.
- Each Prefill click consumes one lookup. The lookup route requires a logged-in user, so anonymous traffic can't burn credits.
- Rotate the key from the provider dashboard if it is ever exposed, then update `.env` / Vercel.
- The GST data returned is public registration data (name, address, status) — but still avoid logging full responses.

## If you prefer a different provider

Other GST-verification APIs exist (e.g. Sandbox.co.in, Masters India, ClearTax GST APIs, government-authorised GSPs). They return different JSON and use different auth (bearer tokens, API-key headers), so switching means a small change to `fetchLiveTaxpayer()` in `lib/sales/gstinLookup.ts` to map their response to: legal name, trade name, status, and address (`bno/bnm/st/loc/dst/stcd/pncd`). Tell me which provider and share a sample response (with the key removed) and I'll wire it.

## Checklist

- [ ] Appyflow account created with a company email
- [ ] Key Secret copied and stored in the team password manager
- [ ] `curl` test returns `"error": false` with the company name
- [ ] `GST_API_KEY` added to local `.env` and dev server restarted
- [ ] `GST_API_KEY` added in Vercel (Production + Preview) and redeployed
- [ ] Prefill on `32AAVCM0878J1ZX` fills name + address in the app
