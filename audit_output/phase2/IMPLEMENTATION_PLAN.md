# Phased Implementation Plan: Free-First GST Rate Architecture
**Aupulens ERP — Technical Implementation Roadmap**

---

## 1. Architectural Resolution Sequence

The system must follow a strict 5-stage resolution pipeline that prioritizes speed, zero-cost operation, and legal defensibility:

```
Step 1: Local In-Memory HSN/SAC Search (0ms)
        └── Full 22,616-item catalog with inverted index for fast autocomplete & "Suggest AI".
                         │
                         ▼
Step 2: Official Versioned Rate Rules Engine (< 2ms)
        └── Exact 8-digit tariff line or heading match from primary CBIC notifications.
                         │
                         ▼
Step 3: Conditional Predicate Evaluation (< 5ms)
        └── Check unit price (<= Rs 1,000) or packaging attributes.
        └── Prompt user only if transactional attribute is missing.
                         │
                         ▼
Step 4: Secondary 8-Digit Tariff Indicative Fallback (< 5ms)
        └── Fallback to secondary customs dataset (13,622 items) marked as "POTENTIAL_SECONDARY".
                         │
                         ▼
Step 5: Paid Tax API Fallback / Enterprise Manual Review
        └── For unmapped Chapter 99 services (582 items) or complex transactions.
        └── Paid responses cached permanently with cryptographically signed provenance.
```

---

## 2. Phased Implementation Roadmap

```
Phase 2A: Catalog Ingestion & Hygiene (Zero Risk)
   └── Merge 146 new 8-digit codes into `master_hsn_sac.json` (Catalog: 22,616).
   └── Strip legacy `_x000D_` carriage returns from existing descriptions.

Phase 2B: Rule Master Correction & Conditionality Engine
   └── Fix Heading 8539 overbroad match bug (restrict 12% rule to 8539 50 / 8539 52 LED lamps).
   └── Add conditional price threshold handlers for Chapters 61, 62 (Apparel) and 64 (Footwear).
   └── Add packaging & labelling predicate handlers for Chapters 04 and 10 (Dairy & Grains).

Phase 2C: Services (SAC Chapter 99) Statutory Baseline Expansion
   └── Map 31 service headings under Notification No. 11/2017-CT(R) (IT, legal, consulting, etc.).
   └── Establish standard 18% residual baseline with clear exemption disclaimers.

Phase 2D: UI & Suggest AI Integration
   └── Preserve existing "Suggest AI" single-click workflow.
   └── When a conditional rule matches, render a non-blocking badge:
       "Applicable rate is 5% if sale price <= Rs 1,000, 12% if > Rs 1,000."

Phase 2E: Enterprise Paid API Adapter (Optional Plugin)
   └── Configure optional ClearTax / Masters India / IRIS GST fallback adapter.
   └── Implement permanent local Redis/MongoDB caching of external responses.
```

---

## 3. Detailed Work Breakdown Structure (WBS)

### Phase 2A: Nomenclature Catalog Ingestion
- **Task 2A.1:** Merge the 146 new 8-digit tariff items from `HSN_SAC.xlsx` into `hsn/master_hsn_sac.json`.
- **Task 2A.2:** Update `hsn/hsn.json` to 21,935 goods.
- **Task 2A.3:** Validate that `hsn/sac.json` remains intact at 681 services.
- **Task 2A.4:** Clean up legacy `_x000D_` string formatting in descriptions for codes `2514 00`, `3914`, `6706`, `9103`.
- **Dependencies:** None (Pure JSON update).
- **Risk:** Negligible. Existing inverted index automatically handles expanded entries.

### Phase 2B: Rate Rule Overhaul & Conditionality Engine
- **Task 2B.1:** Split Heading `8539` rule in `lib/tax/gstRateMaster.ts`:
  - `85395000` / `85395200`: 12% IGST (LED Lamps and Bulbs) — `VERIFIED`.
  - `8539` (General heading): 18% IGST (Filament / fluorescent / discharge lamps) — `VERIFIED`.
- **Task 2B.2:** Implement condition evaluation function `evaluateConditions(rule, transactionContext)`.
- **Task 2B.3:** Add Chapter 61 and 62 conditional apparel rules:
  - If `unitPrice <= 1000` $\rightarrow$ 5% IGST (`CONDITIONAL`).
  - If `unitPrice > 1000` $\rightarrow$ 12% IGST (`CONDITIONAL`).
- **Task 2B.4:** Add Chapter 04 and 10 packaging predicates (`packaging_type === 'PRE_PACKAGED' ? 5 : 0`).
- **Dependencies:** Completion of 2A.
- **Risk:** Low. Must ensure unit test suite verifies all rule branches.

### Phase 2C: Services SAC Matrix Expansion
- **Task 2C.1:** Expand `VERIFIED_GST_RATES` with the 31 statutory headings of Notification 11/2017:
  - Heading 9954: Construction (1% affordable, 5% residential, 18% commercial).
  - Heading 9965: Transport (5% without ITC, 12% with ITC).
  - Heading 9982: Legal & Accounting (18% — with Reverse Charge flag for advocate legal services).
  - Heading 9983: IT, Consulting, Management, Engineering (18%).
  - Heading 9987: Maintenance & Repair (18%).
- **Dependencies:** Completion of 2B.
- **Risk:** Low. Standardizes SAC resolution from 14.5% to > 90%.

### Phase 2D: UI & Product Form Integration
- **Task 2D.1:** Ensure `components/inventory/ProductForm.tsx` and `components/sales/invoices/InvoiceForm.tsx` display statutory citations alongside suggested rates.
- **Task 2D.2:** Display conditional alert pills when a dual-rate commodity is selected.
- **Task 2D.3:** Prevent silent default to 0% when rate is unknown. Display an explicit badge: `Rate: Review Required (Unmapped)`.
- **Dependencies:** Completion of 2B and 2C.
- **Risk:** UI regression; must preserve keyboard navigation and tab order.

### Phase 2E: Paid API Fallback & Caching
- **Task 2E.1:** Create interface `IGstRateProvider` with methods `resolveRate(hsnCode, context)`.
- **Task 2E.2:** Implement local provider as primary; paid provider as fallback when status is `UNKNOWN`.
- **Task 2E.3:** Mandate permanent caching in MongoDB `HsnSacReference` collection with:
  - `sourceId: "CLEARTAX_API_V2" | "MASTERS_INDIA"`.
  - `retrievedAt: new Date()`.
  - `rawResponsePayload: string`.
- **Dependencies:** Enterprise contract with GSP.
- **Risk:** External network latency; mitigated by strict 800ms API timeout and local cache.

---

## 4. Preservation of Architectural Boundaries

1. **Local Catalog Autocomplete:**  
   The in-memory inverted index in `lib/tax/hsnData.ts` will continue to handle sub-millisecond typing lookups without making database queries.
2. **Suggest AI Workflow:**  
   The single-click "Suggest AI" button will continue calling `lookupHsnSac()`, which will now return enriched metadata including `statutoryNotification` and `conditions`.
3. **Historical Document Immutability:**  
   The document generation pipeline in `lib/sales/quoteInvoice.ts` and `models/finance/Invoice.ts` will lock the resolved rate into `invoiceLine.taxReference`. Opening historical documents will never re-trigger rate calculation.
