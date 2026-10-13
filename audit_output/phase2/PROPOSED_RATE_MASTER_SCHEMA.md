# Proposed Versioned GST Rate Evidence Model Architecture
**Aupulens ERP — Technical Architecture Specification (Read-Only Design)**

---

## 1. Architectural Principles

This design provides a robust, future-proof schema architecture for HSN/SAC classification and statutory GST rate resolution in Aupulens ERP. It is structured around four strict legal and engineering principles:

1. **Strict Separation of Nomenclature from Rate Determination:**  
   HSN/SAC codes and descriptions represent standardized trade classification (governed by the Customs Tariff Act and WCO). In contrast, GST rates are fiscal policies established by the GST Council and notified by the Ministry of Finance. A code may remain permanent while its applicable rate changes multiple times across statutory Gazette notifications.
2. **First-Class Representation of Statutory Conditionality:**  
   Tax rates are not always scalar numbers. In Indian GST, a code's applicable rate may depend on transactional attributes (e.g., unit price $\le$ ₹1,000, pre-packaged & labelled status, recipient organization, SEZ status). The engine must evaluate predicate conditions.
3. **Immutability of Historical Document Tax Snapshots:**  
   Once an invoice, credit note, quotation, or purchase order is generated and issued, its tax rates, source citations, and calculations must remain permanently frozen. Upgrading the rate master or updating tax notifications must **never silently mutate past accounting documents**.
4. **Explicit Distinction Between Zero (0%) and Unknown (NULL):**  
   0% represents an affirmative legal determination (Exempt or Nil-rated under Notification 2/2017-CT(R) or Notification 12/2017-CT(R)). A missing rate is **UNKNOWN** and must never default to 0%, preventing illegal under-taxation penalties under Section 122 of the CGST Act.

---

## 2. Proposed Data Models (TypeScript / Mongoose)

```
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│        HsnSacMaster             │         │          GstRateRule            │
│  (Static Nomenclature Catalog)  │         │  (Statutory Notification Rule)  │
├─────────────────────────────────┤         ├─────────────────────────────────┤
│ - code: string (PK)             │         │ - ruleId: string (PK)           │
│ - type: "goods" | "service"     │         │ - targetCodePattern: string     │
│ - description: string           │1       *│ - applicableType: "goods"|"serv"│
│ - level: 2 | 4 | 6 | 8 digits   │────────<│ - igst: number                  │
│ - chapter: string               │         │ - cgst: number                  │
│ - heading: string               │         │ - sgst: number                  │
│ - active: boolean               │         │ - cess: number                  │
└─────────────────────────────────┘         │ - treatment: TaxTreatment       │
                                            │ - conditions: RuleCondition[]   │
                                            │ - effectiveFrom: Date           │
                                            │ - effectiveTo?: Date            │
                                            │ - sourceNotification: string    │
                                            │ - verificationStatus: Status    │
                                            └─────────────────────────────────┘
                                                             │
                                                             │ Resolves Into
                                                             ▼
                                            ┌─────────────────────────────────┐
                                            │       TaxEvidenceSnapshot       │
                                            │   (Embedded on Invoice Line)    │
                                            ├─────────────────────────────────┤
                                            │ - appliedHsnCode: string        │
                                            │ - appliedDescription: string    │
                                            │ - appliedIgst: number           │
                                            │ - appliedCgst: number           │
                                            │ - appliedSgst: number           │
                                            │ - appliedCess: number           │
                                            │ - statutoryNotification: string │
                                            │ - conditionsSatisfied: string[] │
                                            │ - snapshotTimestamp: Date       │
                                            │ - verificationTier: Tier        │
                                            └─────────────────────────────────┘
```

### 2.1 Model 1: `HsnSacMaster` (Standardized Nomenclature)

Represents official trade classification, independent of tax rates:

```typescript
export interface IHsnSacMaster {
  code: string;                      // Normalized string, leading zeros preserved (e.g. "01012100")
  type: "goods" | "service";        // "goods" for Ch 01-98, "service" for Ch 99
  description: string;               // Standard official statutory description
  codeLength: 2 | 4 | 5 | 6 | 7 | 8; // Hierarchy level
  chapter: string;                   // 2-digit chapter (e.g. "01")
  heading?: string;                  // 4-digit heading (e.g. "0101")
  subheading?: string;               // 6-digit subheading (e.g. "010121")
  searchTokens: string[];            // Lowercase tokenized keywords for high-speed indexing
  statutoryScheduleRef?: string;     // First Schedule to Customs Tariff Act 1975 reference
  active: boolean;                   // Flag for superseded tariff lines
  version: string;                   // e.g. "GSTN-2026.1"
}
```

### 2.2 Model 2: `GstRateRule` (Statutory Rate Rules & Evidence)

Represents versioned legal rate rules extracted from official Gazette notifications:

```typescript
export type TaxTreatment = "taxable" | "exempt" | "nil" | "non-gst" | "out-of-scope";

export type VerificationStatus = 
  | "VERIFIED"            // Backed by primary statutory CBIC notification
  | "CONDITIONAL"         // Requires transaction-level attributes (price, packaging)
  | "POTENTIAL_SECONDARY" // Backed by secondary tariff aggregation (india-hsn-2026)
  | "REVIEW_REQUIRED"     // Conflicting interpretations or pending Council review
  | "UNKNOWN";            // Rate unmapped; manual input or paid API required

export interface IConditionPredicate {
  attributeName: "unit_price" | "packaging_type" | "end_use" | "recipient_type" | "itc_claimed";
  operator: "LTE" | "GT" | "EQUALS" | "IN";
  comparisonValue: any;             // e.g. 1000 for apparel/footwear
  promptMessage: string;            // UI explanation when prompting user
}

export interface IGstRateRule {
  ruleId: string;                   // Unique slug (e.g. "RULE-CH61-APPAREL-CONCESSION")
  targetCodePattern: string;        // Prefix or exact code (e.g. "61", "1006", "85395000", "9954")
  applicableType: "goods" | "service";
  description: string;              // Statutory entry description
  
  // Rate Components
  cgst: number;                     // Central GST % (e.g. 2.5)
  sgst: number;                     // State/UT GST % (e.g. 2.5)
  igst: number;                     // Integrated GST % (e.g. 5.0)
  cess: number;                     // Compensation Cess % (e.g. 0, or 12 + Rs 4170/th)
  treatment: TaxTreatment;
  
  // Statutory Evidence & Provenance
  sourceNotification: string;       // e.g. "Notification No. 1/2017-Central Tax (Rate)"
  scheduleNumber?: string;          // e.g. "Schedule I, Entry No. 223"
  officialSourceUrl?: string;       // URL to official Gazette PDF on cbic.gov.in
  effectiveFrom: Date;              // Date from which this rule applies
  effectiveTo?: Date;               // Superseded date, or null if currently active
  
  // Conditionality Engine
  isConditional: boolean;
  conditions?: IConditionPredicate[];
  
  // Verification Tier
  verificationStatus: VerificationStatus;
  confidenceScore: number;          // 1.0 for primary statutory, 0.7 for secondary, 0.0 for unmapped
  supersedesRuleId?: string;        // Audit trail for amended rules
}
```

### 2.3 Model 3: `TaxEvidenceSnapshot` (Document Line Item Immutability)

Embedded directly inside `IInvoiceLine`, `IQuotationLine`, and `IPurchaseOrderLine`:

```typescript
export interface ITaxEvidenceSnapshot {
  appliedHsnCode: string;
  appliedDescription: string;
  appliedIgst: number;
  appliedCgst: number;
  appliedSgst: number;
  appliedCess: number;
  treatment: TaxTreatment;
  statutoryNotification: string;
  scheduleEntry?: string;
  conditionsSatisfied: string[];     // Snapshot of conditions met at invoice creation
  snapshotTimestamp: Date;           // Exact instant the tax rate was locked
  verificationTier: VerificationStatus;
  ruleVersionId: string;
  overrideReason?: string;          // If manual override was supplied by tax accountant
}
```

---

## 3. Concrete Sample Records

### Sample 1: Apparel Subject to Price Threshold (Chapter 61)

```json
[
  {
    "ruleId": "RULE-CH61-GARMENT-TIER1",
    "targetCodePattern": "61",
    "applicableType": "goods",
    "description": "Articles of apparel and clothing accessories, knitted or crocheted, sale value not exceeding Rs. 1000 per piece",
    "cgst": 2.5,
    "sgst": 2.5,
    "igst": 5.0,
    "cess": 0,
    "treatment": "taxable",
    "sourceNotification": "Notification No. 1/2017-Central Tax (Rate)",
    "scheduleNumber": "Schedule I, Entry 223",
    "effectiveFrom": "2017-07-01T00:00:00.000Z",
    "isConditional": true,
    "conditions": [
      {
        "attributeName": "unit_price",
        "operator": "LTE",
        "comparisonValue": 1000,
        "promptMessage": "Applicable rate is 5% if sale value is Rs. 1,000 or less per piece."
      }
    ],
    "verificationStatus": "CONDITIONAL",
    "confidenceScore": 1.0
  },
  {
    "ruleId": "RULE-CH61-GARMENT-TIER2",
    "targetCodePattern": "61",
    "applicableType": "goods",
    "description": "Articles of apparel and clothing accessories, knitted or crocheted, sale value exceeding Rs. 1000 per piece",
    "cgst": 6.0,
    "sgst": 6.0,
    "igst": 12.0,
    "cess": 0,
    "treatment": "taxable",
    "sourceNotification": "Notification No. 1/2017-Central Tax (Rate)",
    "scheduleNumber": "Schedule II, Entry 171",
    "effectiveFrom": "2017-07-01T00:00:00.000Z",
    "isConditional": true,
    "conditions": [
      {
        "attributeName": "unit_price",
        "operator": "GT",
        "comparisonValue": 1000,
        "promptMessage": "Applicable rate is 12% if sale value exceeds Rs. 1,000 per piece."
      }
    ],
    "verificationStatus": "CONDITIONAL",
    "confidenceScore": 1.0
  }
]
```

### Sample 2: Pre-Packaged Cereals (Chapter 10, Post-2022 Amendment)

```json
[
  {
    "ruleId": "RULE-CH10-RICE-UNPACKAGED",
    "targetCodePattern": "1006",
    "applicableType": "goods",
    "description": "Rice - other than pre-packaged and labelled",
    "cgst": 0.0,
    "sgst": 0.0,
    "igst": 0.0,
    "cess": 0,
    "treatment": "exempt",
    "sourceNotification": "Notification No. 2/2017-Central Tax (Rate)",
    "scheduleNumber": "Exempt Schedule, Entry 45",
    "effectiveFrom": "2022-07-18T00:00:00.000Z",
    "isConditional": true,
    "conditions": [
      {
        "attributeName": "packaging_type",
        "operator": "EQUALS",
        "comparisonValue": "LOOSE_UNPACKAGED",
        "promptMessage": "Nil-rated only if sold loose and unpackaged."
      }
    ],
    "verificationStatus": "CONDITIONAL",
    "confidenceScore": 1.0
  },
  {
    "ruleId": "RULE-CH10-RICE-PACKAGED",
    "targetCodePattern": "1006",
    "applicableType": "goods",
    "description": "Rice - pre-packaged and labelled as per Legal Metrology Act, 2009",
    "cgst": 2.5,
    "sgst": 2.5,
    "igst": 5.0,
    "cess": 0,
    "treatment": "taxable",
    "sourceNotification": "Notification No. 1/2017-Central Tax (Rate) as amended by Notif 6/2022-CT(R)",
    "scheduleNumber": "Schedule I, Entry 24",
    "effectiveFrom": "2022-07-18T00:00:00.000Z",
    "isConditional": true,
    "conditions": [
      {
        "attributeName": "packaging_type",
        "operator": "EQUALS",
        "comparisonValue": "PRE_PACKAGED_LABELLED",
        "promptMessage": "Subject to 5% GST if pre-packaged and labelled."
      }
    ],
    "verificationStatus": "CONDITIONAL",
    "confidenceScore": 1.0
  }
]
```

### Sample 3: Services IT Software Development (SAC 998314)

```json
{
  "ruleId": "RULE-SAC998314-IT-SOFTWARE",
  "targetCodePattern": "998314",
  "applicableType": "service",
  "description": "Information technology (IT) design and development services including custom software development",
  "cgst": 9.0,
  "sgst": 9.0,
  "igst": 18.0,
  "cess": 0,
  "treatment": "taxable",
  "sourceNotification": "Notification No. 11/2017-Central Tax (Rate)",
  "scheduleNumber": "Heading 9983, Entry (ii)",
  "effectiveFrom": "2017-07-01T00:00:00.000Z",
  "isConditional": false,
  "verificationStatus": "VERIFIED",
  "confidenceScore": 1.0
}
```

---

## 4. Safeguards Against Inadvertent Data Mutation

1. **Pre-Save Mongoose Hook:**  
   Invoices with status `posted` or `sent` must throw an error if any line item's `taxReference` or tax calculations are modified.
2. **Read-Only Lookup in Form Views:**  
   When opening an existing invoice, tax amounts are rendered strictly from `invoiceLine.taxReference` and `invoiceLine.priceSubtotal * (taxRate / 100)`. Never re-trigger `lookupHsnSac()` on historical documents.
3. **Audit Trail Logging:**  
   Any manual adjustment by a user with `admin` privileges generates a persistent log in `CrmAuditLog` capturing previous rate, new rate, user ID, and justification.
