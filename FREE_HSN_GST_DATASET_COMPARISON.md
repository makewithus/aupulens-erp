# Free HSN/SAC & GST Dataset Coverage Audit Report
**Aupulens ERP — Tax Classification & Rate Resolution Subsystem**
*Audit Date:* October 12, 2026  
*Status:* Complete | Read-Only Audit  
*Scope:* Evaluation of Free HSN/SAC Reference Data & Official vs. Secondary GST Rate Coverage

---

## Executive Summary

This audit compares the newly downloaded HSN/GST-related dataset (`HSN_SAC.xlsx`) against all existing HSN/SAC and GST reference data within the Aupulens ERP repository (`/home/krrish/Desktop/Aupulens-ERP/Aupulens-ERP-main`). The primary objective is to establish the **maximum reliable classification and GST-rate coverage achievable exclusively through free, open-access resources**, without incurring API subscription fees or violating software licensing constraints.

### Key Audit Findings

1. **Nature of the Downloaded Dataset (`HSN_SAC.xlsx`):**
   - The file is an official master nomenclature workbook published by the **Goods and Services Tax Network (GSTN)**.
   - It contains **22,616 total rows** across two sheets: `HSN_MSTR` (**21,935 goods**) and `SAC_MSTR` (**681 services**).
   - **Crucial Limitation:** `HSN_SAC.xlsx` **contains ZERO GST tax rate fields, tax percentages, cess specifications, notification citations, or exemption flags.** It is exclusively a standardized HSN/SAC code and description directory for return filing validation.
2. **Code Catalog Overlap & Expansion:**
   - The existing repository master (`hsn/master_hsn_sac.json`) contains **22,470 records** (21,789 goods and 681 services).
   - Overlap between the new download and the existing master is **100.0% (22,470 / 22,470)**. **Zero existing codes are missing.**
   - The downloaded file expands goods classification by **+146 new 8-digit tariff items** (primarily recent agricultural and chemical additions, e.g., Pecan nuts, Cranberries, Blueberries, Krill). Service codes (SAC) are identical at **681 records**.
   - Combining both datasets yields a deduplicated baseline catalogue of **22,616 total codes** (21,935 goods and 681 services).
3. **GST Rate Coverage Assessment (Before vs. After):**
   - **Strict Verified Rate Coverage (Tier 1 — Official CBIC Notifications in `gstRateMaster.ts`):**  
     **1,161 records (5.13%)** across the combined catalogue (1,062 goods [4.84%], 99 services [14.54%]). Backed by direct statutory notifications (e.g., Notification No. 1/2017-CT(R), 2/2017-CT(R), 11/2017-CT(R)).
   - **Potential Rate Coverage (Tier 2 — Secondary Customs/GST Tariff Dataset `india-hsn-2026.csv`):**  
     **13,622 additional goods records (60.23%)** can be matched to 8-digit tariff rates derived from secondary government tariff compilations. However, this dataset contains **zero service rates (0% SAC coverage)**.
   - **Maximum Achievable Free Coverage (Tier 1 + Tier 2):**  
     **14,783 out of 22,616 records (65.37%)** [Goods: 14,684 / 21,935 (66.94%), Services: 99 / 681 (14.54%)].
   - **Unresolved Coverage Gap (Tier 3 — Unmapped or Ambiguous):**  
     **7,833 records (34.63%)** [Goods: 7,251 (33.06%), Services: 582 (85.46%)] cannot be resolved using any currently available free dataset.
4. **Rate Conflicts and Conditional Tax Traps:**
   - Exactly **489 goods codes** exhibit rate discrepancies between broad heading-level rules (e.g., in `gstRateMaster.ts`) and specific 8-digit tariff entries (in `india-hsn-2026.csv`).
   - These discrepancies stem from **statutory conditionality** (e.g., unbranded/loose agricultural produce at 0% vs. pre-packaged and labelled at 5%; apparel priced ≤ ₹1,000 at 5% vs. > ₹1,000 at 12%). A static flat rate lookup without transaction context will cause legal non-compliance.
5. **Verdict on Paid GST Providers:**
   - Free datasets reliably solve **65.4% of goods classifications**.
   - However, **85.5% of service codes (SAC Chapter 99) remain unmapped**, and free sources cannot evaluate transaction-level conditional rates (e.g., unit pricing, branding, turnover thresholds, composite supplies).
   - **Conclusion:** A specialized, paid GST provider or live tax API remains **strongly justified for high-volume enterprise compliance**, specialized service-sector billing, and automated filing where incorrect tax invoices incur penalties under Section 122 of the CGST Act. For internal CRM quotation and estimation, the 65.4% free baseline augmented by structured user prompts is viable.

---

## 1. Dataset Inventory and Provenance

Every dataset analyzed during this audit has been identified and verified with its cryptographic hash, file size, line counts, and licensing terms:

| Dataset | Location / Filename | File Type & Size | SHA-256 Checksum | Declared Publisher & Source | Effective Date / Version | Free Use License | Tax Rate Fields Present? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **New Download** | `hsn/HSN_SAC.xlsx` (also in `~/Downloads`) | Excel Spreadsheet (`.xlsx`)<br>`668,474 bytes` | `051108e31063f1ef0d6dfb005a622bcc848878fa2d94fae51a73e67f8916871e` | **GSTN (Goods and Services Tax Network)**<br>Official GST Portal utility download | Downloaded Oct 12, 2026 (Reflects Tariff 2024–2026) | Open Public Reference Data (Free for filers/ERPs) | **NO** (Only code & description) |
| **Existing Local Master** | `hsn/master_hsn_sac.json` | JSON Document<br>`3,622,900 bytes` | `7d79b9a67448d3df62ea63e2646d5c6439162f4477c0827284eb3b72c9a9ec2b` | **Repository Master**<br>(Derived from prior CBIC/GSTN exports) | Baseline repository build | Project Internal / Free | **NO** (Only code & description) |
| **Split Goods Master** | `hsn/hsn.json` | JSON Document<br>`3,514,244 bytes` | `8cfae4f8d66cbdb18b1054a3a60a7eec65476a6cf17fcf18d1844b1c8c504037` | **Repository Goods Master** | Baseline repository build | Project Internal / Free | **NO** |
| **Split Services Master** | `hsn/sac.json` | JSON Document<br>`108,656 bytes` | `5c928dc7f481a533bfd7a2283a0058b8f2c3d0b263b65e75d0458dfa3eb7caee` | **Repository Services Master** | Baseline repository build | Project Internal / Free | **NO** |
| **Secondary Customs/GST Tariff** | `hsn/india-hsn-2026.csv` / `.json` | CSV Text File<br>`1,540,644 bytes` | `9d555c88015383569a74bfb4fbdaec966c4062145e69e38f615e47c1b52a6549` | **hsnlookup.in**<br>(Secondary compilation of CBIC Tariff & ClearTax) | As of 2026 (Updated post-GST Council meeting 53) | CC-BY-4.0 (Attribution Required) | **YES** (IGST, BCD, SWS, Cess) |
| **Verified GST Rate Rules** | `lib/tax/gstRateMaster.ts` | TypeScript Module<br>`13,114 bytes` | N/A (Repository Code) | **Aupulens Tax Rules**<br>(Extracted from official CBIC Rate Notifications) | Notification No. 1/2017 & 2/2017 as amended | Project Code (Proprietary / MIT) | **YES** (CGST, SGST, IGST, Cess, Schedules) |

---

## 2. Schema and Column Profiling

### 2.1 Side-by-Side Schema Comparison

```
+-----------------------------+-----------------------------+-----------------------------+-----------------------------+
| Field Concept               | Downloaded: HSN_SAC.xlsx    | Local: master_hsn_sac.json  | Secondary: india-hsn-2026   |
+-----------------------------+-----------------------------+-----------------------------+-----------------------------+
| Code Identifier             | HSN_CD / SAC_CD             | code                        | hsn                         |
| Description                 | HSN_Description / SAC_Desc  | description (or desc)       | desc                        |
| Classification Type         | Sheet partition (HSN vs SAC)| type ("goods" / "services") | Implicit (All goods Ch 1-98)|
| Code Length                 | Derived (2, 4, 6, 8 digits) | length                      | Derived (8 digits)          |
| Chapter Number              | Derived from first 2 digits | Derived                     | chapter                     |
| Basic Customs Duty (BCD)    | Not present                 | Not present                 | bcd                         |
| Social Welfare Surcharge    | Not present                 | Not present                 | sws                         |
| IGST Rate Percentage        | Not present                 | Not present                 | igst                        |
| Compensation Cess           | Not present                 | Not present                 | cess                        |
| Verification / Source Ref   | Not present                 | Not present                 | igst_verification           |
| Effective As-Of Date        | Not present                 | Not present                 | as_of                       |
+-----------------------------+-----------------------------+-----------------------------+-----------------------------+
```

### 2.2 Normalization and Data Quality Rules
1. **Preservation of Leading Zeros:**  
   Codes starting with `0` (e.g., Chapter 01 live animals `0101`, Chapter 04 dairy `0401`, Chapter 08 edible fruits `0802`) must strictly remain string types with leading zeros intact. Converting to numerical types converts `0401` to `401`, corrupting search and tariff resolution.
2. **Strict Separation of Goods vs. Services:**  
   Services under Chapter 99 (SAC) often share numeric prefixes with Chapter 99 goods (e.g., `9993` in SAC relates to educational services, while heading `99` in goods covers postal parcels and baggage). They must be tracked under separate partition domains.
3. **Carriage Return Artifacts:**  
   The existing master contains Excel export artifacts (`_x000D_`) embedded in descriptions (e.g., in headings `2514 00`, `3914`, `6706`, `9103`). The newly downloaded `HSN_SAC.xlsx` uses clean whitespace, resolving these legacy formatting defects.
4. **Blank Descriptions:**  
   In `HSN_SAC.xlsx`, code `52083110` has an empty description cell (`""`), representing an unlabelled national sub-heading for woven cotton fabrics.

---

## 3. Code Overlap and Catalog Expansion Analysis

### 3.1 Quantitative Overlap Breakdown

The deduplicated catalog comparison demonstrates that the newly downloaded file completely subsumes the existing master dataset and expands it:

```
+-------------------------------------------------------+-------------+-------------+-------------+
| Metric                                                | Total       | Goods       | Services    |
+-------------------------------------------------------+-------------+-------------+-------------+
| Total Records in Downloaded File (HSN_SAC.xlsx)       | 22,616      | 21,935      | 681         |
| Total Records in Local Master (master_hsn_sac.json)   | 22,470      | 21,789      | 681         |
| Exact Code Overlap (Found in Both)                    | 22,470      | 21,789      | 681         |
| Overlap Percentage (% of Existing Master Covered)     | 100.00%     | 100.00%     | 100.00%     |
| Existing Codes Missing from New Download              | 0           | 0           | 0           |
| New Unique Valid Codes Introduced by Download         | +146        | +146        | 0           |
| Combined Deduplicated Master Total                    | 22,616      | 21,935      | 681         |
+-------------------------------------------------------+-------------+-------------+-------------+
```

### 3.2 Code Length Hierarchy Distribution

Indian GST nomenclature is hierarchical: Chapter (2-digit) $\rightarrow$ Heading (4-digit) $\rightarrow$ Sub-heading (6-digit) $\rightarrow$ National Tariff Item (8-digit). The code distribution shows:

```
+---------------+-----------------------------+-----------------------------+-----------------------------+
| Code Length   | HSN_SAC.xlsx (Goods)        | master_hsn_sac.json (Goods) | Net Variance (New - Master) |
+---------------+-----------------------------+-----------------------------+-----------------------------+
| 2-Digit       | 98                          | 98                          | 0                           |
| 4-Digit       | 1,348                       | 1,348                       | 0                           |
| 5-Digit*      | 3                           | 3                           | 0                           |
| 6-Digit       | 5,773                       | 5,773                       | 0                           |
| 7-Digit*      | 4                           | 4                           | 0                           |
| 8-Digit       | 14,709                      | 14,563                      | +146                        |
+---------------+-----------------------------+-----------------------------+-----------------------------+
| Total Goods   | 21,935                      | 21,789                      | +146                        |
+---------------+-----------------------------+-----------------------------+-----------------------------+

*Note: 5-digit and 7-digit entries in government files represent typographical anomalies from earlier manual tariff Gazette entries (e.g., `40210` representing `040210`, or `5119110` representing `05119110`).
```

For **Services (SAC Chapter 99)**:
- 2-digit (Chapter 99): **1**
- 4-digit (Heading 99xx): **31**
- 6-digit (Service Group / Tariff SAC): **649**
- Total Services: **681** (Identical in both datasets, zero net change).

### 3.3 Description Discrepancies and Collisions

Across the 22,470 common codes, exactly **16 codes exhibit description differences** (`audit_output/conflicting_descriptions.csv`):
- **11 codes:** Differ solely due to `_x000D_` carriage return escape sequences present in the legacy JSON master.
- **5 codes:** Contain substantive statutory amendments:
  1. `29394110`: Master contains hierarchical prefix path `"VEGETABLE ALKALOIDS... EPHEDRINES..."`, whereas `HSN_SAC.xlsx` uses the concise statutory name `"Ephedrine"`.
  2. `29394190`: Master contains full prefix path; `HSN_SAC.xlsx` contains concise `"Other"`.
  3. `85079010`: Master states `"ACCUMULATOR CASES MADE OF HARD RUBBER AND SEPARATORS"`; `HSN_SAC.xlsx` states `"Accumulator cases made of hard rubber"`.
  4. `85299030`: Master states `"Open cell for television set"` (customs exemption description); `HSN_SAC.xlsx` lists standard tariff `"Other, for apparatus of headings 8525 to 8527"`.
  5. `52083110`: Master had description; `HSN_SAC.xlsx` has an empty string (`""`).

### 3.4 Description-Only Matches (New Codes Matching Existing Descriptions)

Four new 8-digit codes in `HSN_SAC.xlsx` possess descriptions matching different existing master codes (`audit_output/full_audit_metrics.json`):
- **`13021950`** (`Cashew shell liquid (CNSL), crude`) $\rightarrow$ previously recorded under `13021920`.
- **`13021960`** (`Purified and distilled CNSL (Cardanol)`) $\rightarrow$ previously recorded under `13021930`.
- **`29322040`** (`Gibberellic acid`) $\rightarrow$ previously recorded under pesticide chapter heading `38089330`.
- **`81019920`** (`Bars and rods... strip and foil`) $\rightarrow$ previously categorized under `810295`.

*Implication:* These represent statutory tariff reclassifications where the Ministry of Finance created dedicated 8-digit tariff lines for specific chemical/industrial commodities previously pooled under broad sub-headings.

---

## 4. GST-Rate Coverage Comparison (Before vs. After)

### 4.1 How the Current Resolver Works (`lib/tax/gstRateMaster.ts`)

The existing engine in `lib/tax/gstRateMaster.ts` resolves rates using hierarchical matching:
1. Exact 8-digit code match.
2. 6-digit sub-heading prefix match.
3. 4-digit heading prefix match.
4. 2-digit chapter regex match.
5. Service category match (Chapter 99 SAC prefix).

It currently evaluates **27 official verified rules** (`VERIFIED_GST_RATES`) extracted directly from Notification No. 1/2017-Central Tax (Rate), Notification No. 2/2017-Central Tax (Rate), and Notification No. 11/2017-Central Tax (Rate).

### 4.2 Comprehensive Coverage Calculations

Using the deduplicated combined catalogue of **22,616 records** as the authoritative denominator:

```
+---------------------------------------------+-------------------+--------------------+--------------------+
| Coverage Classification Tier                | Total Combined    | Goods (HSN)        | Services (SAC)     |
|                                             | Denom = 22,616    | Denom = 21,935     | Denom = 681        |
+---------------------------------------------+-------------------+--------------------+--------------------+
| Tier 1: Strict Verified Coverage            | 1,161 records     | 1,062 records      | 99 records         |
| (Official CBIC Notifications in Code)       | (5.13%)           | (4.84%)            | (14.54%)           |
+---------------------------------------------+-------------------+--------------------+--------------------+
| Tier 2: Potential Coverage                  | 13,622 records    | 13,622 records     | 0 records          |
| (Secondary Tariff Dataset: india-hsn-2026)  | (60.23%)          | (62.10%)           | (0.00%)            |
+---------------------------------------------+-------------------+--------------------+--------------------+
| Total Resolvable Free Coverage              | 14,783 records    | 14,684 records     | 99 records         |
| (Tier 1 + Tier 2 Combined)                  | (65.37%)          | (66.94%)           | (14.54%)           |
+---------------------------------------------+-------------------+--------------------+--------------------+
| Tier 3: Unresolved Coverage                 | 7,833 records     | 7,251 records      | 582 records        |
| (No Rate Available in Any Free Source)      | (34.63%)          | (33.06%)           | (85.46%)           |
+---------------------------------------------+-------------------+--------------------+--------------------+
```

### 4.3 Detailed Formula Specifications

$$\text{Strict Verified Coverage \%} = \frac{\text{Records Matching Verified CBIC Notification Rules}}{\text{Total Combined Catalog (22,616)}} = \frac{1,161}{22,616} = 5.13\%$$

$$\text{Potential Free Rate Coverage \%} = \frac{\text{Records with Secondary 8-Digit Tariff Rates}}{\text{Total Combined Catalog (22,616)}} = \frac{13,622}{22,616} = 60.23\%$$

$$\text{Maximum Resolvable Free Coverage \%} = \frac{\text{Tier 1 (Strict) + Tier 2 (Potential)}}{\text{Total Combined Catalog (22,616)}} = \frac{14,783}{22,616} = 65.37\%$$

$$\text{Unresolved Coverage \%} = \frac{\text{Total Combined Catalog} - \text{Resolvable Records}}{\text{Total Combined Catalog (22,616)}} = \frac{7,833}{22,616} = 34.63\%$$

### 4.4 Analysis of Conflicting Rates (489 Codes)

When comparing the 27 broad notification rules against the 8-digit tariff items in `india-hsn-2026.csv`, **489 codes produce conflicting rates** (`audit_output/conflicting_gst_rates.csv`). 

#### Root Cause of Conflicts: Statutory Conditionality
Indian GST law does not assign a single static percentage to many commodity groups. Instead, rates depend on **transactional conditions**:

```
+---------------+-----------------------------------+---------------+---------------+----------------------------------------------------------+
| Code          | Commodity Description             | Rule Rate (%) | Tariff Rate(%)| Legal Root Cause for Conflict                            |
+---------------+-----------------------------------+---------------+---------------+----------------------------------------------------------+
| `04011000`    | Milk not exceeding 1% fat         | 0% (Exempt)   | 5%            | Notification 2/2017: 0% if fresh/unpasteurized;          |
|               |                                   |               |               | Notification 1/2017 (amended by 6/2022): 5% if packaged. |
+---------------+-----------------------------------+---------------+---------------+----------------------------------------------------------+
| `04039010`    | Butter milk                       | 0% (Exempt)   | 5%            | 0% if sold loose; 5% if pre-packaged and labelled.       |
+---------------+-----------------------------------+---------------+---------------+----------------------------------------------------------+
| `10061010`    | Rice of seed quality              | 0% (Exempt)   | 5%            | 0% for seed/loose grain; 5% for branded pre-packaged.    |
+---------------+-----------------------------------+---------------+---------------+----------------------------------------------------------+
| `61091000`    | T-shirts, singlets of cotton      | 5%            | 12%           | 5% if sale value ≤ ₹1,000 per piece;                     |
|               |                                   |               |               | 12% if sale value > ₹1,000 per piece.                    |
+---------------+-----------------------------------+---------------+---------------+----------------------------------------------------------+
| `64029990`    | Other footwear of rubber/plastics | 12%           | 18%           | 12% if sale value ≤ ₹1,000 per pair;                     |
|               |                                   |               |               | 18% if sale value > ₹1,000 per pair.                     |
+---------------+-----------------------------------+---------------+---------------+----------------------------------------------------------+
```

*Conclusion on Broad Heading Rules:* Assigning a flat heading-level rate across an entire chapter or 4-digit heading without checking unit price thresholds or packaging status will generate legally incorrect tax invoices.

---

## 5. Source Quality and Free-Use Eligibility

```
+-----------------------------------+--------------------+------------------------+-------------------+---------------------------------------------+
| Source Name                       | Authority Level    | Provenance & Citation  | License Terms     | Reliability Assessment                      |
+-----------------------------------+--------------------+------------------------+-------------------+---------------------------------------------+
| **GSTN / CBIC Official Portal**   | Authoritative      | gst.gov.in / cbic.gov  | Public Domain /   | **100% Reliable for Codes & Descriptions.** |
| (`HSN_SAC.xlsx`)                  | (Govt of India)    | Official Filing Utility| Open Gov Data     | Contains NO tax rates.                      |
+-----------------------------------+--------------------+------------------------+-------------------+---------------------------------------------+
| **CBIC Statutory Notifications**  | Authoritative      | taxinformation.cbic    | Official Legal    | **100% Legally Binding.**                   |
| (`gstRateMaster.ts` rules)        | (Statutory Law)    | Notif 1/2017, 2/2017   | Gazette           | Highly reliable, but currently covers       |
|                                   |                    | Central Tax (Rate)     |                   | only 27 specific commodity/service rules.   |
+-----------------------------------+--------------------+------------------------+-------------------+---------------------------------------------+
| **Secondary Tariff Dataset**      | Secondary /        | hsnlookup.in           | CC-BY-4.0         | **Useful as Baseline for Goods Only.**      |
| (`india-hsn-2026.csv`)            | Aggregated         | Compiles Customs &     | (Attribution Req) | Unverified for recent Council revisions.    |
|                                   |                    | ClearTax rates         |                   | 0% coverage for Services (SAC Chapter 99).  |
+-----------------------------------+--------------------+------------------------+-------------------+---------------------------------------------+
```

### Free Commercial Eligibility
- Both `HSN_SAC.xlsx` and official CBIC notifications are public government edicts and may be freely utilized within commercial ERP applications without licensing fees.
- `india-hsn-2026.csv` requires CC-BY-4.0 attribution (e.g., in software notices or tax configuration disclaimers).

---

## 6. Maximum Achievable Free Coverage

### 6.1 The Three Coverage Tiers

```
Combined Deduplicated Catalog: 22,616 Records
│
├── Tier 1: Strict Verified Coverage (Official CBIC Notifications)
│   ├── Count: 1,161 records (5.13%)
│   ├── Goods: 1,062 (4.84%)
│   └── Services: 99 (14.54%)
│   └── Quality: Authoritative, legally defensible, cited to statutory notifications.
│
├── Tier 2: Potential Coverage (Secondary 8-Digit Customs/GST Dataset)
│   ├── Count: 13,622 records (60.23%)
│   ├── Goods: 13,622 (62.10%)
│   └── Services: 0 (0.00%)
│   └── Quality: Good for standard goods; lacks service SACs; subject to conditionality.
│
└── Tier 3: Unresolved Coverage (No Free Machine-Readable Rate Source)
    ├── Count: 7,833 records (34.63%)
    ├── Goods: 7,251 (33.06%)
    └── Services: 582 (85.46%)
    └── Quality: Requires manual lookup, user input, or commercial live tax API.
```

### 6.2 Why 34.6% Remains Unresolved Using Free Sources

1. **The Services Void (85.5% of SAC Codes Unmapped):**  
   Free datasets treat HSN/SAC primarily from a customs perspective. Services (Chapter 99) do not pass through customs and have no 8-digit Customs Tariff entries. Official GST rate schedules for services are published in narrative tables (Notification 11/2017-CT(R)) with complex conditions (e.g., restaurant with AC vs. without AC; IT software licensing vs. service; real estate construction under 1% / 5% affordable housing without ITC). No free machine-readable dataset currently maps all 681 SAC codes to these conditions.
2. **Dynamic Tariff Line Splits:**  
   7,251 goods codes in `HSN_SAC.xlsx` (including broad 2-digit, 4-digit headings, and newly introduced 8-digit agricultural lines) have no counterpart in `india-hsn-2026.csv`.
3. **Availability of Official Bulk APIs:**  
   The Government of India provides a web portal ("CBIC GST Rate Finder"), but **does NOT provide a free, bulk downloadable, machine-readable JSON/CSV API** for automated synchronization.

---

## 7. Deliverables & Audit Artifacts Inventory

All audit data has been written to the dedicated `/audit_output` directory without altering source code or production databases:

```
/home/krrish/Desktop/Aupulens-ERP/Aupulens-ERP-main/audit_output/
├── new_codes_in_downloaded_dataset.csv        (146 newly introduced 8-digit tariff items)
├── missing_codes_from_downloaded_dataset.csv    (0 missing codes; confirms 100% overlap)
├── conflicting_descriptions.csv               (16 codes with text/formatting variations)
├── conflicting_gst_rates.csv                  (489 codes with rate conflicts between sources)
├── potential_newly_covered_rates_sample.csv   (Sample of 13,622 potential 8-digit tariff rates)
├── unresolved_records_sample.csv              (Sample of 7,833 unmapped records)
├── summary_metrics.json                       (Core overlap and coverage counts)
└── full_audit_metrics.json                    (Comprehensive multi-tier coverage metrics)
```

---

## 8. Strategic Recommendations & Conclusion

### 8.1 Recommended Engineering Architecture for Aupulens ERP

To achieve the highest possible classification accuracy while maintaining legal tax compliance:

1. **Ingest the 146 New Codes into `master_hsn_sac.json`:**  
   Update the local master from 22,470 to **22,616 records**. This ensures modern commodities (e.g., Blueberries, Pecan nuts, modern chemicals) are fully searchable in the CRM product catalog.
2. **Implement a Tiered Tax Resolver in `gstRateMaster.ts`:**
   - **Step 1 (Strict Verified Rule):** If an active CBIC notification rule exists, apply it and cite the notification.
   - **Step 2 (Secondary 8-Digit Tariff Lookup):** If no strict rule matches, fall back to `india-hsn-2026` rate as an *indicative* rate (flagged with `confidence: "INDICATIVE_SECONDARY"`).
   - **Step 3 (Conditional Prompting):** For commodities subject to dual rates (apparel, footwear, agricultural commodities), display a prompt in the UI:
     > *"Applicable GST rate is conditional: 5% if sale value ≤ ₹1,000, 12% if > ₹1,000. Please confirm unit price."*
   - **Step 4 (Service Fallback):** For unmapped SAC service codes (85.5% of SACs), default to the standard service rate of **18%** (under Heading 9983/9987/9988 residual provisions) but require explicit user confirmation.

### 8.2 Conclusion: Is a Paid GST Provider Still Justified?

| Requirement Scenario | Free Datasets Sufficient? | Justification for Paid Provider |
| :--- | :--- | :--- |
| **B2B Quotations & Estimates** | **YES (65.4% Coverage)** | Internal estimates and CRM product listings can operate effectively with the 65.4% baseline and manual overrides. |
| **Standard Domestic Goods Invoicing** | **PARTIAL** | Sufficient for goods with static rates; requires conditional checks for garments, footwear, and dairy. |
| **Service Sector Invoicing (SAC Ch 99)** | **NO (14.5% Coverage)** | **Paid API / legal provider is necessary.** 85.5% of service codes lack machine-readable rate data. |
| **Automated E-Invoicing & E-Way Bills** | **NO** | **Paid GSP / E-invoicing provider is legally required.** The GST Portal mandates real-time validation via GST Suvidha Providers (GSPs) for IRN generation. |
| **Real-Time GST Council Amendments** | **NO** | Static free files become stale whenever the GST Council alters rates (e.g., changes in health insurance, cancer drugs, namkeen rates). |

**Final Assessment:**  
By combining the official GSTN `HSN_SAC.xlsx` nomenclature with the secondary customs tariff dataset, Aupulens ERP can achieve **65.37% free rate coverage and 100% code coverage (22,616 items)** with zero API costs. For the remaining **34.63% (principally commercial services and conditional commodities)**, a paid GST API remains strictly justified for production tax compliance.
