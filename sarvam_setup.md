# Sarvam AI setup

The multilingual layer is **optional**. With no key the product runs exactly as before (English-only, no errors).

## 1. Get an API key
1. Sign in at <https://dashboard.sarvam.ai> (create an account if needed).
2. Open **API Keys** and create a key. Copy it — it is shown once.
3. Note your plan's per-character price for Translate (needed for cost reporting, step 4).

## 2. Put it in `.env` (never commit it; `.env` is git-ignored)
```
SARVAM_API_KEY=<paste key>
SARVAM_API_BASE_URL=https://api.sarvam.ai
SARVAM_ENABLED=true
SARVAM_TIMEOUT_MS=2000
SARVAM_DEFAULT_TARGET_LANGUAGE=en
# optional: how Roman-script Hindi etc. is handled — "direct" (default, 1 call) or "transliterate_first" (2 calls)
# SARVAM_ROMAN_STRATEGY=direct
```
Restart the dev server (`npm run dev`). On Vercel add the same variables in Project → Settings → Environment Variables.

## 3. Switches
| Switch | Where | Effect |
|---|---|---|
| Global kill | `SARVAM_ENABLED=false` | layer off everywhere, original text goes to the AI |
| No key | `SARVAM_API_KEY` empty | same as above (reason `not_configured`) |
| Per tenant | `Organization.settings.ai.multilingualDisabled = true` | layer off for that workspace |

## 4. Cost reporting (Global Admin AI dashboard)
Rates are stored, never hardcoded. Seed them once with your dashboard's price (USD per 1,000 characters):
```
SARVAM_COST_PER_1K_CHARS_USD=<price> npx tsx scripts/seed-platform-sarvam-cost-rates.ts
```
Until seeded, Sarvam calls are still recorded (provider `sarvam`, characters, latency) with cost 0.

## 5. Verify
Follow `docs/sarvam/LIVE_VERIFICATION.md`.

## Security
The key is read server-side only, is never logged, never included in error messages and never sent to the browser.
