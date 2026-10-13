# Comprehensive Test Plan: GST Rate Master & Classification Subsystem
**Aupulens ERP — Quality Assurance & Regression Test Specifications**

---

## 1. Test Strategy Overview

Before any production implementation of Phase 2 recommendations, this test suite must execute and pass in continuous integration (CI) via `npm run test` (Vitest).

The test suite is structured across 6 critical validation layers:
1. **Catalog Integrity & Indexing Tests:** Validates all 22,616 items load without truncation or malformed codes.
2. **Strict vs. Indicative Rate Resolution Tests:** Verifies that official rules take precedence over secondary data.
3. **Conditionality & Threshold Logic Tests:** Asserts correct rate branching for dual-rate commodities.
4. **Historical Document Immutability Tests:** Verifies invoice line tax snapshots are permanently frozen.
5. **Reverse Lookup & Conflict Tests:** Validates HSN-to-Product autofill and conflicting code resolution.
6. **Performance & Memory Benchmark Tests:** Guarantees < 10ms response times for autocomplete and search.

---

## 2. Test Suites Specification

### Suite 1: Catalog Integrity & Normalization (`tests/tax/catalogIntegrity.test.ts`)

| Test ID | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| `TC-CAT-01` | Load `master_hsn_sac.json` after ingesting 146 new codes | Total records must equal exactly **22,616** (Goods: 21,935, Services: 681). |
| `TC-CAT-02` | Preservation of leading zeros for Chapter 01 to 09 | Codes such as `"01012100"`, `"04011000"`, `"08029910"` must retain leading zero strings. |
| `TC-CAT-03` | Cleanliness of descriptions | Assert zero occurrences of `"_x000D_"` in any catalog item description. |
| `TC-CAT-04` | Service separation (SAC Chapter 99) | Searching `"services"` must never return Chapter 01-98 goods; goods searches never return SAC. |
| `TC-CAT-05` | Empty description fallback | For code `52083110` (blank description in XLSX), fallback cleanly to parent heading description. |

### Suite 2: Rate Resolution & Tier Prioritization (`tests/tax/rateResolutionTiers.test.ts`)

| Test ID | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| `TC-TIER-01` | Tier 1 Strict Rule takes absolute precedence | Code `84713010` (Laptop) must resolve to 18% with `sourceNotification: "Notification No. 1/2017-CT(R)"` and `status: "VERIFIED"`. |
| `TC-TIER-02` | Tier 2 Potential Fallback for un-ruled goods | An un-ruled industrial chemical (e.g., `28041000` Hydrogen) must resolve to 18% with `status: "POTENTIAL_SECONDARY"` and cite `india-hsn-2026`. |
| `TC-TIER-03` | Tier 3 Unresolved records never default to 0% | An unmapped tariff line with no source must return `gstRate: undefined`, `gstTreatment: undefined`, and `status: "UNRESOLVED"`. **Must never return 0.** |
| `TC-TIER-04` | Services Tier 1 SAC Resolution | SAC `998314` (IT Software) must resolve to 18% with `sourceNotification: "Notification No. 11/2017-CT(R)"`. |

### Suite 3: Conditionality & Statutory Threshold Tests (`tests/tax/conditionalityRules.test.ts`)

| Test ID | Test Scenario | Input Attributes | Expected Result |
| :--- | :--- | :--- | :--- |
| `TC-COND-01` | Cotton T-Shirt priced at ₹600 (Apparel) | HSN: `61091000`, `unitPrice`: 600 | **5% IGST** (`CONDITIONAL`, Notif 1/2017 Sched I) |
| `TC-COND-02` | Cotton T-Shirt priced at ₹1,800 (Apparel) | HSN: `61091000`, `unitPrice`: 1800 | **12% IGST** (`CONDITIONAL`, Notif 1/2017 Sched II) |
| `TC-COND-03` | Leather Footwear priced at ₹850 | HSN: `64039990`, `unitPrice`: 850 | **12% IGST** (Notif 1/2017 Sched II) |
| `TC-COND-04` | Leather Footwear priced at ₹2,500 | HSN: `64039990`, `unitPrice`: 2500 | **18% IGST** (Notif 1/2017 Sched III) |
| `TC-COND-05` | Basmati Rice - Sold loose / unpackaged | HSN: `10063020`, `packaging`: "LOOSE" | **0% IGST (Exempt)** (Notif 2/2017) |
| `TC-COND-06` | Basmati Rice - Pre-packaged & labelled | HSN: `10063020`, `packaging`: "PRE_PACKED"| **5% IGST** (Notif 1/2017 as amended by 6/2022) |
| `TC-COND-07` | LED Bulb (Specific sub-heading 8539 52) | HSN: `85395200` | **12% IGST** (LED concession, Notif 1/2017 Sched II) |
| `TC-COND-08` | Tungsten Filament Bulb (Heading 8539 21) | HSN: `85392110` | **18% IGST** (Standard filament lamp, Sched III) |

### Suite 4: Historical Document Tax Snapshot Immutability (`tests/sales/taxSnapshotImmutability.test.ts`)

| Test ID | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| `TC-SNAP-01` | Invoice Line Item creation | Line item locks `taxReference` with `sourceId`, `effectiveDate`, and `gstRate`. |
| `TC-SNAP-02` | Invoice Posting | Status transitions to `posted`. Line items become strictly immutable. |
| `TC-SNAP-03` | Rate Master Updated Post-Issuance | When a subsequent notification changes a rate (e.g. from 18% to 12%), loading or recalculating the historical invoice must retain the original 18% snapshot. |
| `TC-SNAP-04` | Quotation to Invoice Conversion | Converting Quote $\rightarrow$ Sales Order $\rightarrow$ Invoice preserves the locked tax snapshot without recalculating unless user edits line items. |

### Suite 5: Reverse Lookup & Conflict Resolution (`tests/tax/reverseLookup.test.ts`)

| Test ID | Test Scenario | Expected Outcome |
| :--- | :--- | :--- |
| `TC-REV-01` | User inputs HSN `"853952"` with no description | System auto-populates `"LED Lamps and light fittings"`, sets rate to 12%, confidence `"high"`. |
| `TC-REV-02` | User inputs conflicting description & HSN | Product description `"Laptop Computer"` with HSN `"01012100"` (Horses). System flags `reviewRequired: true`, confidence `"low"`. |
| `TC-REV-03` | Newly introduced 2026 code lookup | Entering `"08029910"` immediately returns `"Pecan nuts"`, type `"goods"`. |

### Suite 6: Performance & Memory Benchmarks (`tests/tax/hsnPerformance.test.ts`)

| Benchmark Metric | Threshold | Target Performance |
| :--- | :--- | :--- |
| **Inverted Index Cold Initialization** | < 250ms | ~120ms (One-time load on server startup) |
| **Typing Autocomplete Query Latency** | < 10ms | ~1.8ms per keystroke (Sub-millisecond token lookup) |
| **Suggest AI End-to-End Ranking** | < 25ms | ~4.5ms for full token scoring and rate resolution |
| **Heap Memory Overhead** | < 60 MB | ~38 MB for full 22,616 records and token index |
| **Cache Hit Rate (LRU 500)** | > 75% | > 85% for common business products |

---

## 3. Sample Executable Test Code (Vitest)

```typescript
import { describe, expect, it } from "vitest";
import { lookupHsnSac, findHsnSacReference, searchHsnSac } from "@/lib/tax/hsnData";
import { resolveGstRate } from "@/lib/tax/gstRateMaster";

describe("Phase 2 Tax Resolution & Conditionality Test Suite", () => {
  it("TC-COND-01 & 02: Evaluates apparel price threshold accurately", () => {
    // Low value T-shirt (<= Rs 1,000)
    const lowValue = lookupHsnSac("Cotton knitted round-neck t-shirt", "goods");
    expect(lowValue.selected?.code).toBe("6109");
    expect(lowValue.selected?.gstRate).toBe(5);
    expect(lowValue.selected?.verificationStatus).toBe("CONDITIONAL");

    // Rules engine provides both alternative branches for conditional selection
    const rules = resolveGstRate("61091000", "goods");
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules.some(r => r.igst === 5 && r.conditions?.[0].includes("1000"))).toBe(true);
    expect(rules.some(r => r.igst === 12 && r.conditions?.[0].includes("1000"))).toBe(true);
  });

  it("TC-COND-07 & 08: Distinguishes LED lamps from filament bulbs in Heading 8539", () => {
    const ledRules = resolveGstRate("85395200", "goods");
    expect(ledRules[0].igst).toBe(12); // LED concession

    const filamentRules = resolveGstRate("85392110", "goods");
    expect(filamentRules[0].igst).toBe(18); // Standard filament rate
  });

  it("TC-TIER-03: Never returns 0% for unmapped / unknown items", () => {
    // Arbitrary unmapped code
    const result = findHsnSacReference("99999999", "goods");
    if (result) {
      expect(result.gstRate).not.toBe(0);
      expect(result.verificationStatus).toBe("UNRESOLVED");
    }
  });
});
```

---

## 4. Acceptance Sign-Off Criteria

Before merging Phase 2 implementation code:
1. All 6 test suites must achieve **100% pass rate** in Vitest.
2. Zero regressions in pre-existing test suites:
   - `tests/tax/hsnSacLookup.test.ts`
   - `tests/tax/hsnPerformanceOptimization.test.ts`
   - `tests/sales/conversionIntegrityFailure.test.ts`
   - `tests/crm/crmWorkflowRegression.test.ts`
3. Git working tree must remain clean with zero unauthorized file changes.
