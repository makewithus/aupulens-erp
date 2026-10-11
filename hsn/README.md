# India HSN + Customs Duty Dataset 2026

Public dataset of **12,136 India 8-digit ITC(HS) tariff items** with Basic Customs Duty (BCD), Social Welfare Surcharge (SWS), Integrated GST (IGST) and Compensation Cess rates.

Maintained by [hsnlookup.in](https://hsnlookup.in) — a free Indian HSN and customs-duty reference.

## Files

| File | Format | Size |
| --- | --- | --- |
| `india-hsn-2026.csv` | UTF-8 CSV | ~2.2 MB |
| `india-hsn-2026.json` | JSON | ~3.4 MB |

Schema (same for both):

```
hsn           8-digit India ITC(HS) tariff item (string)
description   canonical tariff description
chapter       HS chapter number 1..97
bcd           Basic Customs Duty, percent
sws           Social Welfare Surcharge, percent of BCD
igst          Integrated GST on import, percent
cess          Compensation Cess, percent (mostly 0)
```

## Quick lookup

```bash
# CSV
grep ',85171300,' india-hsn-2026.csv      # smartphones
grep ',71081300,' india-hsn-2026.csv      # gold

# JSON with jq
jq '.data[] | select(.hsn == "85171300")' india-hsn-2026.json
```

Or hit the live endpoint at [hsnlookup.in/api/hsn.json](https://hsnlookup.in/api/hsn.json) (same data, no download needed).

## How to compute landed cost

For any assessable value `AV` (CIF + 1% landing charges), the four-part Indian duty stack is:

```
BCD   = AV × bcd%
SWS   = BCD × sws%
Cess  = (AV + BCD) × cess%
IGST  = (AV + BCD + SWS + Cess) × igst%
Total = BCD + SWS + Cess + IGST
```

Worked out for every HSN at every CIF tier on [hsnlookup.in](https://hsnlookup.in), or try the [duty calculator](https://hsnlookup.in/calculator/).

## Sources and verification

- **IGST rates** — CBIC GST rate schedule (notifications under the IGST Act, 2017), compiled via Cleartax's public HSN lookup index. Verified per-row.
- **BCD rates** — 36 hand-reviewed for high-volume codes; chapter-default First Schedule statutory rate for the rest. **Always verify BCD against the current CBIC notification before filing a Bill of Entry.**
- **SWS** — 10% of BCD per Finance Act 2018 Section 110 (a small set of goods are exempt; check specific notifications).
- **Cess** — GST Compensation Act 2017 for the applicable HSNs (tobacco, luxury cars, aerated beverages, coal, etc.).

Last refresh: **April 2026**, against CBIC Notification No. 45/2025-Customs (dated 24-Oct-2025) and No. 02/2026-Customs (dated 1-Feb-2026).

## Refresh cadence

After each Union Budget (February) and any major CBIC consolidated notification. Follow this repo or hit the live endpoint for the latest version.

## Licence

**[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)** — free for commercial and non-commercial use. You must attribute hsnlookup.in with a visible link in any redistributed or derivative form.

## Support

- Site: [hsnlookup.in](https://hsnlookup.in)
- Rate corrections or data-licensing enquiries: `hello@hsnlookup.in`
- Commercial/bulk licence (quarterly refresh feed, custom schema): same inbox

## Not legal advice

This dataset is informational. For any specific Bill of Entry filing, verify against the current CBIC notification applicable to your HSN and date. Customs duty rates change frequently via gazette notifications.
