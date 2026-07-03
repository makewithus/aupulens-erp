/**
 * ============================================================
 *  UNIVERSAL DOCUMENT STATUS WORKFLOW
 * ============================================================
 *
 *  DRAFT → PENDING_APPROVAL → APPROVED → POSTED → CLOSED
 *                  ↘ REJECTED
 *                  ↘ CANCELLED
 *
 *  This file is the SINGLE SOURCE OF TRUTH for all document /
 *  transaction statuses across every module.
 *
 *  ⚠  NEVER hard-code status strings elsewhere — always import
 *     from this file.
 * ============================================================
 */

// --------------- Universal Document Status -------------------

export const DOCUMENT_STATUS = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  POSTED: "posted",
  CLOSED: "closed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

/** Ordered array – usable in Mongoose `enum` validators */
export const DOCUMENT_STATUS_VALUES = Object.values(DOCUMENT_STATUS);
// → ["draft","pending_approval","approved","posted","closed","rejected","cancelled"]

/** TypeScript union type for any document status field */
export type DocumentStatus =
  (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

// --------------- Valid Transitions ---------------------------

export const DOCUMENT_STATUS_TRANSITIONS: Record<
  DocumentStatus,
  DocumentStatus[]
> = {
  [DOCUMENT_STATUS.DRAFT]: [
    DOCUMENT_STATUS.PENDING_APPROVAL,
    DOCUMENT_STATUS.CANCELLED,
  ],
  [DOCUMENT_STATUS.PENDING_APPROVAL]: [
    DOCUMENT_STATUS.APPROVED,
    DOCUMENT_STATUS.REJECTED,
    DOCUMENT_STATUS.CANCELLED,
  ],
  [DOCUMENT_STATUS.APPROVED]: [
    DOCUMENT_STATUS.POSTED,
    DOCUMENT_STATUS.CANCELLED,
  ],
  [DOCUMENT_STATUS.POSTED]: [DOCUMENT_STATUS.CLOSED],
  [DOCUMENT_STATUS.CLOSED]: [],
  [DOCUMENT_STATUS.REJECTED]: [DOCUMENT_STATUS.DRAFT], // can re-draft after rejection
  [DOCUMENT_STATUS.CANCELLED]: [],
};

// --------------- Helpers -------------------------------------

/**
 * Check whether moving from `current` → `next` is allowed.
 */
export function isValidTransition(
  current: DocumentStatus,
  next: DocumentStatus,
): boolean {
  return (DOCUMENT_STATUS_TRANSITIONS[current] ?? []).includes(next);
}

/**
 * Return the list of statuses the document can move to from `current`.
 */
export function getNextStatuses(current: DocumentStatus): DocumentStatus[] {
  return DOCUMENT_STATUS_TRANSITIONS[current] ?? [];
}

// --------------- UI Helpers ----------------------------------

/** Human-readable labels */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  [DOCUMENT_STATUS.DRAFT]: "Draft",
  [DOCUMENT_STATUS.PENDING_APPROVAL]: "Pending Approval",
  [DOCUMENT_STATUS.APPROVED]: "Approved",
  [DOCUMENT_STATUS.POSTED]: "Posted",
  [DOCUMENT_STATUS.CLOSED]: "Closed",
  [DOCUMENT_STATUS.REJECTED]: "Rejected",
  [DOCUMENT_STATUS.CANCELLED]: "Cancelled",
};

/** Tailwind-friendly badge colours (bg + text) */
export const DOCUMENT_STATUS_COLORS: Record<
  DocumentStatus,
  { bg: string; text: string }
> = {
  [DOCUMENT_STATUS.DRAFT]: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
  },
  [DOCUMENT_STATUS.PENDING_APPROVAL]: {
    bg: "bg-yellow-100 dark:bg-yellow-900",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  [DOCUMENT_STATUS.APPROVED]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [DOCUMENT_STATUS.POSTED]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [DOCUMENT_STATUS.CLOSED]: {
    bg: "bg-purple-100 dark:bg-purple-900",
    text: "text-purple-700 dark:text-purple-300",
  },
  [DOCUMENT_STATUS.REJECTED]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [DOCUMENT_STATUS.CANCELLED]: {
    bg: "bg-orange-100 dark:bg-orange-900",
    text: "text-orange-700 dark:text-orange-300",
  },
};

// ============================================================
//  DOMAIN-SPECIFIC STATUSES  (non-document entities)
//  Still centralised here so nothing is hard-coded elsewhere.
// ============================================================

// --- Entity / Resource Status (User, Warehouse, FreightProvider) ---
export const ENTITY_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  MAINTENANCE: "maintenance",
} as const;
export const ENTITY_STATUS_VALUES = Object.values(ENTITY_STATUS);
export type EntityStatus = (typeof ENTITY_STATUS)[keyof typeof ENTITY_STATUS];

// --- Inventory Stock Level ---
export const STOCK_LEVEL_STATUS = {
  IN_STOCK: "in-stock",
  LOW_STOCK: "low-stock",
  OUT_OF_STOCK: "out-of-stock",
  RESERVED: "reserved",
} as const;
export const STOCK_LEVEL_STATUS_VALUES = Object.values(STOCK_LEVEL_STATUS);
export type StockLevelStatus =
  (typeof STOCK_LEVEL_STATUS)[keyof typeof STOCK_LEVEL_STATUS];

// --- Batch Lifecycle ---
export const BATCH_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  QUARANTINE: "quarantine",
  RELEASED: "released",
} as const;
export const BATCH_STATUS_VALUES = Object.values(BATCH_STATUS);
export type BatchStatus = (typeof BATCH_STATUS)[keyof typeof BATCH_STATUS];

// --- Batch Customs ---
export const BATCH_CUSTOMS_STATUS = {
  PENDING: "pending",
  CLEARED: "cleared",
  BONDED: "bonded",
} as const;
export const BATCH_CUSTOMS_STATUS_VALUES = Object.values(BATCH_CUSTOMS_STATUS);

// --- Bank Reconciliation ---
export const RECONCILIATION_STATUS = {
  MATCHED: "matched",
  UNMATCHED: "unmatched",
  IGNORED: "ignored",
} as const;
export const RECONCILIATION_STATUS_VALUES = Object.values(
  RECONCILIATION_STATUS,
);
export type ReconciliationStatus =
  (typeof RECONCILIATION_STATUS)[keyof typeof RECONCILIATION_STATUS];

// --- Task Lifecycle ---
export const TASK_STATUS = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  REVIEW: "review",
  DONE: "done",
} as const;
export const TASK_STATUS_VALUES = Object.values(TASK_STATUS);
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

// --- Project Lifecycle ---
export const PROJECT_STATUS = {
  PLANNING: "planning",
  ACTIVE: "active",
  ON_HOLD: "on_hold",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export const PROJECT_STATUS_VALUES = Object.values(PROJECT_STATUS);
export type ProjectStatus =
  (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

// --- Organization / Subscription ---
export const SUBSCRIPTION_STATUS = {
  TRIAL: "trial",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
} as const;
export const SUBSCRIPTION_STATUS_VALUES = Object.values(SUBSCRIPTION_STATUS);
export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

// --- Payment State (for Invoices / Bills) ---
export const PAYMENT_STATE = {
  NOT_PAID: "not_paid",
  IN_PAYMENT: "in_payment",
  PAID: "paid",
  PARTIAL: "partial",
  OVERDUE: "overdue",
} as const;
export const PAYMENT_STATE_VALUES = Object.values(PAYMENT_STATE);
export type PaymentState = (typeof PAYMENT_STATE)[keyof typeof PAYMENT_STATE];

// --- Logistics / Shipment Tracking ---
export const SHIPMENT_TRACKING_STATUS = {
  SCHEDULED: "scheduled",
  PENDING: "pending",
  IN_TRANSIT: "in-transit",
  CUSTOMS: "customs",
  LANDED: "landed",
  DELIVERED: "delivered",
  DELAYED: "delayed",
  CANCELLED: "cancelled",
} as const;
export const SHIPMENT_TRACKING_STATUS_VALUES = Object.values(
  SHIPMENT_TRACKING_STATUS,
);
export type ShipmentTrackingStatus =
  (typeof SHIPMENT_TRACKING_STATUS)[keyof typeof SHIPMENT_TRACKING_STATUS];

// --- Production / Manufacturing Flow ---
// Flow: Demand → Production Order → Reserve Materials → Issue Materials
//       → In Production → QC → (Pass → Finished | Fail → Rework → back to Production)
export const PRODUCTION_STATUS = {
  DEMAND_FORECAST: "demand_forecast",
  PRODUCTION_ORDER: "production_order",
  MATERIAL_RESERVED: "material_reserved",
  MATERIAL_ISSUED: "material_issued",
  IN_PRODUCTION: "in_production",
  QC_PENDING: "qc_pending",
  QC_PASSED: "qc_passed",
  QC_FAILED: "qc_failed",
  REWORK: "rework",
  FINISHED: "finished",
  CANCELLED: "cancelled",
} as const;
export const PRODUCTION_STATUS_VALUES = Object.values(PRODUCTION_STATUS);
export type ProductionStatus =
  (typeof PRODUCTION_STATUS)[keyof typeof PRODUCTION_STATUS];

/** Valid transitions for the Plan-to-Produce workflow */
export const PRODUCTION_STATUS_TRANSITIONS: Record<
  ProductionStatus,
  ProductionStatus[]
> = {
  [PRODUCTION_STATUS.DEMAND_FORECAST]: [
    PRODUCTION_STATUS.PRODUCTION_ORDER,
    PRODUCTION_STATUS.CANCELLED,
  ],
  [PRODUCTION_STATUS.PRODUCTION_ORDER]: [
    PRODUCTION_STATUS.MATERIAL_RESERVED,
    PRODUCTION_STATUS.CANCELLED,
  ],
  [PRODUCTION_STATUS.MATERIAL_RESERVED]: [
    PRODUCTION_STATUS.MATERIAL_ISSUED,
    PRODUCTION_STATUS.CANCELLED,
  ],
  [PRODUCTION_STATUS.MATERIAL_ISSUED]: [
    PRODUCTION_STATUS.IN_PRODUCTION,
    PRODUCTION_STATUS.CANCELLED,
  ],
  [PRODUCTION_STATUS.IN_PRODUCTION]: [
    PRODUCTION_STATUS.QC_PENDING,
    PRODUCTION_STATUS.CANCELLED,
  ],
  [PRODUCTION_STATUS.QC_PENDING]: [
    PRODUCTION_STATUS.QC_PASSED,
    PRODUCTION_STATUS.QC_FAILED,
  ],
  [PRODUCTION_STATUS.QC_PASSED]: [PRODUCTION_STATUS.FINISHED],
  [PRODUCTION_STATUS.QC_FAILED]: [
    PRODUCTION_STATUS.REWORK,
    PRODUCTION_STATUS.CANCELLED,
  ],
  [PRODUCTION_STATUS.REWORK]: [
    PRODUCTION_STATUS.IN_PRODUCTION, // goes back to production
    PRODUCTION_STATUS.CANCELLED,
  ],
  [PRODUCTION_STATUS.FINISHED]: [], // terminal state
  [PRODUCTION_STATUS.CANCELLED]: [],
};

/** Check whether moving from `current` → `next` is a valid production transition */
export function isValidProductionTransition(
  current: ProductionStatus,
  next: ProductionStatus,
): boolean {
  return (PRODUCTION_STATUS_TRANSITIONS[current] ?? []).includes(next);
}

/** Return the list of production statuses reachable from `current` */
export function getNextProductionStatuses(
  current: ProductionStatus,
): ProductionStatus[] {
  return PRODUCTION_STATUS_TRANSITIONS[current] ?? [];
}

/** Human-readable labels for production statuses */
export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  [PRODUCTION_STATUS.DEMAND_FORECAST]: "Demand Forecast",
  [PRODUCTION_STATUS.PRODUCTION_ORDER]: "Production Order",
  [PRODUCTION_STATUS.MATERIAL_RESERVED]: "Material Reserved",
  [PRODUCTION_STATUS.MATERIAL_ISSUED]: "Material Issued",
  [PRODUCTION_STATUS.IN_PRODUCTION]: "In Production",
  [PRODUCTION_STATUS.QC_PENDING]: "QC Pending",
  [PRODUCTION_STATUS.QC_PASSED]: "QC Passed",
  [PRODUCTION_STATUS.QC_FAILED]: "QC Failed",
  [PRODUCTION_STATUS.REWORK]: "Rework",
  [PRODUCTION_STATUS.FINISHED]: "Finished Goods",
  [PRODUCTION_STATUS.CANCELLED]: "Cancelled",
};

/** Tailwind-friendly badge colours for production statuses */
export const PRODUCTION_STATUS_COLORS: Record<
  ProductionStatus,
  { bg: string; text: string }
> = {
  [PRODUCTION_STATUS.DEMAND_FORECAST]: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
  },
  [PRODUCTION_STATUS.PRODUCTION_ORDER]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [PRODUCTION_STATUS.MATERIAL_RESERVED]: {
    bg: "bg-indigo-100 dark:bg-indigo-900",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  [PRODUCTION_STATUS.MATERIAL_ISSUED]: {
    bg: "bg-cyan-100 dark:bg-cyan-900",
    text: "text-cyan-700 dark:text-cyan-300",
  },
  [PRODUCTION_STATUS.IN_PRODUCTION]: {
    bg: "bg-yellow-100 dark:bg-yellow-900",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  [PRODUCTION_STATUS.QC_PENDING]: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
  [PRODUCTION_STATUS.QC_PASSED]: {
    bg: "bg-emerald-100 dark:bg-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  [PRODUCTION_STATUS.QC_FAILED]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [PRODUCTION_STATUS.REWORK]: {
    bg: "bg-orange-100 dark:bg-orange-900",
    text: "text-orange-700 dark:text-orange-300",
  },
  [PRODUCTION_STATUS.FINISHED]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [PRODUCTION_STATUS.CANCELLED]: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-500",
  },
};

/** Ordered step list for the production flow progress indicator (excludes branching) */
export const PRODUCTION_FLOW_STEPS: ProductionStatus[] = [
  PRODUCTION_STATUS.DEMAND_FORECAST,
  PRODUCTION_STATUS.PRODUCTION_ORDER,
  PRODUCTION_STATUS.MATERIAL_RESERVED,
  PRODUCTION_STATUS.MATERIAL_ISSUED,
  PRODUCTION_STATUS.IN_PRODUCTION,
  PRODUCTION_STATUS.QC_PENDING,
  PRODUCTION_STATUS.FINISHED,
];

// --- Customs Clearance Status ---
export const CUSTOMS_STATUS = {
  PENDING: "pending",
  CLEARED: "cleared",
  HELD: "held",
  REJECTED: "rejected",
} as const;
export const CUSTOMS_STATUS_VALUES = Object.values(CUSTOMS_STATUS);
export type CustomsStatusType =
  (typeof CUSTOMS_STATUS)[keyof typeof CUSTOMS_STATUS];

// ============================================================
//  VOUCHER-DRIVEN ACCOUNTING (Tally-inspired)
// ============================================================
//
//  Flow: Draft → Validated → Pending Approval → Approved → Posted (Ledger Updated)
//                    ↘ Rejected → Draft
//                    ↘ Cancelled

/** Voucher types – each maps to a specific accounting entry pattern */
export const VOUCHER_TYPE = {
  PAYMENT: "payment",
  RECEIPT: "receipt",
  CONTRA: "contra",
  JOURNAL: "journal",
  SALES: "sales",
  PURCHASE: "purchase",
} as const;
export const VOUCHER_TYPE_VALUES = Object.values(VOUCHER_TYPE);
export type VoucherType = (typeof VOUCHER_TYPE)[keyof typeof VOUCHER_TYPE];

/** Human-readable labels for voucher types */
export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  [VOUCHER_TYPE.PAYMENT]: "Payment Voucher",
  [VOUCHER_TYPE.RECEIPT]: "Receipt Voucher",
  [VOUCHER_TYPE.CONTRA]: "Contra Voucher",
  [VOUCHER_TYPE.JOURNAL]: "Journal Voucher",
  [VOUCHER_TYPE.SALES]: "Sales Voucher",
  [VOUCHER_TYPE.PURCHASE]: "Purchase Voucher",
};

/** Short prefix used for auto-numbering vouchers */
export const VOUCHER_TYPE_PREFIX: Record<VoucherType, string> = {
  [VOUCHER_TYPE.PAYMENT]: "PAY",
  [VOUCHER_TYPE.RECEIPT]: "RCT",
  [VOUCHER_TYPE.CONTRA]: "CTR",
  [VOUCHER_TYPE.JOURNAL]: "JRN",
  [VOUCHER_TYPE.SALES]: "SAL",
  [VOUCHER_TYPE.PURCHASE]: "PUR",
};

/** Badge colours for each voucher type */
export const VOUCHER_TYPE_COLORS: Record<
  VoucherType,
  { bg: string; text: string }
> = {
  [VOUCHER_TYPE.PAYMENT]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [VOUCHER_TYPE.RECEIPT]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [VOUCHER_TYPE.CONTRA]: {
    bg: "bg-cyan-100 dark:bg-cyan-900",
    text: "text-cyan-700 dark:text-cyan-300",
  },
  [VOUCHER_TYPE.JOURNAL]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [VOUCHER_TYPE.SALES]: {
    bg: "bg-emerald-100 dark:bg-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  [VOUCHER_TYPE.PURCHASE]: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
};

/** Voucher-specific status (extends DOCUMENT_STATUS with a "validated" gate) */
export const VOUCHER_STATUS = {
  DRAFT: "draft",
  VALIDATED: "validated",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  POSTED: "posted", // ledger updated
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;
export const VOUCHER_STATUS_VALUES = Object.values(VOUCHER_STATUS);
export type VoucherStatus =
  (typeof VOUCHER_STATUS)[keyof typeof VOUCHER_STATUS];

/** Valid transitions for the voucher workflow */
export const VOUCHER_STATUS_TRANSITIONS: Record<
  VoucherStatus,
  VoucherStatus[]
> = {
  [VOUCHER_STATUS.DRAFT]: [VOUCHER_STATUS.VALIDATED, VOUCHER_STATUS.CANCELLED],
  [VOUCHER_STATUS.VALIDATED]: [
    VOUCHER_STATUS.PENDING_APPROVAL,
    VOUCHER_STATUS.APPROVED, // skip approval when not required
    VOUCHER_STATUS.CANCELLED,
  ],
  [VOUCHER_STATUS.PENDING_APPROVAL]: [
    VOUCHER_STATUS.APPROVED,
    VOUCHER_STATUS.REJECTED,
  ],
  [VOUCHER_STATUS.APPROVED]: [VOUCHER_STATUS.POSTED, VOUCHER_STATUS.CANCELLED],
  [VOUCHER_STATUS.POSTED]: [], // terminal – ledger updated, immutable
  [VOUCHER_STATUS.REJECTED]: [VOUCHER_STATUS.DRAFT],
  [VOUCHER_STATUS.CANCELLED]: [],
};

export function isValidVoucherTransition(
  current: VoucherStatus,
  next: VoucherStatus,
): boolean {
  return (VOUCHER_STATUS_TRANSITIONS[current] ?? []).includes(next);
}

export function getNextVoucherStatuses(
  current: VoucherStatus,
): VoucherStatus[] {
  return VOUCHER_STATUS_TRANSITIONS[current] ?? [];
}

/** Human-readable labels for voucher statuses */
export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  [VOUCHER_STATUS.DRAFT]: "Draft",
  [VOUCHER_STATUS.VALIDATED]: "Validated",
  [VOUCHER_STATUS.PENDING_APPROVAL]: "Pending Approval",
  [VOUCHER_STATUS.APPROVED]: "Approved",
  [VOUCHER_STATUS.POSTED]: "Posted",
  [VOUCHER_STATUS.REJECTED]: "Rejected",
  [VOUCHER_STATUS.CANCELLED]: "Cancelled",
};

/** Badge colours for voucher statuses */
export const VOUCHER_STATUS_COLORS: Record<
  VoucherStatus,
  { bg: string; text: string }
> = {
  [VOUCHER_STATUS.DRAFT]: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
  },
  [VOUCHER_STATUS.VALIDATED]: {
    bg: "bg-indigo-100 dark:bg-indigo-900",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  [VOUCHER_STATUS.PENDING_APPROVAL]: {
    bg: "bg-yellow-100 dark:bg-yellow-900",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  [VOUCHER_STATUS.APPROVED]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [VOUCHER_STATUS.POSTED]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [VOUCHER_STATUS.REJECTED]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [VOUCHER_STATUS.CANCELLED]: {
    bg: "bg-orange-100 dark:bg-orange-900",
    text: "text-orange-700 dark:text-orange-300",
  },
};

/** Ordered flow steps for the voucher stepper (excludes branching) */
export const VOUCHER_FLOW_STEPS: VoucherStatus[] = [
  VOUCHER_STATUS.DRAFT,
  VOUCHER_STATUS.VALIDATED,
  VOUCHER_STATUS.PENDING_APPROVAL,
  VOUCHER_STATUS.APPROVED,
  VOUCHER_STATUS.POSTED,
];

// ============================================================
//  PERIOD CLOSING (SAP-inspired)
// ============================================================
//
//  Flow: Open → Locked → Accruals Posted → Reconciled → Closed → Statements Generated

export const PERIOD_CLOSING_STATUS = {
  OPEN: "open",
  LOCKED: "locked",
  ACCRUALS_POSTED: "accruals_posted",
  RECONCILED: "reconciled",
  CLOSED: "closed",
  STATEMENTS_GENERATED: "statements_generated",
} as const;
export const PERIOD_CLOSING_STATUS_VALUES = Object.values(
  PERIOD_CLOSING_STATUS,
);
export type PeriodClosingStatus =
  (typeof PERIOD_CLOSING_STATUS)[keyof typeof PERIOD_CLOSING_STATUS];

export const PERIOD_CLOSING_TRANSITIONS: Record<
  PeriodClosingStatus,
  PeriodClosingStatus[]
> = {
  [PERIOD_CLOSING_STATUS.OPEN]: [PERIOD_CLOSING_STATUS.LOCKED],
  [PERIOD_CLOSING_STATUS.LOCKED]: [
    PERIOD_CLOSING_STATUS.ACCRUALS_POSTED,
    PERIOD_CLOSING_STATUS.OPEN, // unlock / revert
  ],
  [PERIOD_CLOSING_STATUS.ACCRUALS_POSTED]: [
    PERIOD_CLOSING_STATUS.RECONCILED,
    PERIOD_CLOSING_STATUS.LOCKED, // revert
  ],
  [PERIOD_CLOSING_STATUS.RECONCILED]: [
    PERIOD_CLOSING_STATUS.CLOSED,
    PERIOD_CLOSING_STATUS.ACCRUALS_POSTED, // revert
  ],
  [PERIOD_CLOSING_STATUS.CLOSED]: [PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED],
  [PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED]: [], // terminal
};

export function isValidPeriodTransition(
  current: PeriodClosingStatus,
  next: PeriodClosingStatus,
): boolean {
  return (PERIOD_CLOSING_TRANSITIONS[current] ?? []).includes(next);
}

export function getNextPeriodStatuses(
  current: PeriodClosingStatus,
): PeriodClosingStatus[] {
  return PERIOD_CLOSING_TRANSITIONS[current] ?? [];
}

export const PERIOD_CLOSING_STATUS_LABELS: Record<PeriodClosingStatus, string> =
  {
    [PERIOD_CLOSING_STATUS.OPEN]: "Open",
    [PERIOD_CLOSING_STATUS.LOCKED]: "Posting Locked",
    [PERIOD_CLOSING_STATUS.ACCRUALS_POSTED]: "Accruals Posted",
    [PERIOD_CLOSING_STATUS.RECONCILED]: "Reconciled",
    [PERIOD_CLOSING_STATUS.CLOSED]: "Period Closed",
    [PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED]: "Statements Generated",
  };

export const PERIOD_CLOSING_STATUS_COLORS: Record<
  PeriodClosingStatus,
  { bg: string; text: string }
> = {
  [PERIOD_CLOSING_STATUS.OPEN]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [PERIOD_CLOSING_STATUS.LOCKED]: {
    bg: "bg-yellow-100 dark:bg-yellow-900",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  [PERIOD_CLOSING_STATUS.ACCRUALS_POSTED]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [PERIOD_CLOSING_STATUS.RECONCILED]: {
    bg: "bg-indigo-100 dark:bg-indigo-900",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  [PERIOD_CLOSING_STATUS.CLOSED]: {
    bg: "bg-purple-100 dark:bg-purple-900",
    text: "text-purple-700 dark:text-purple-300",
  },
  [PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED]: {
    bg: "bg-emerald-100 dark:bg-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
  },
};

/** Ordered flow steps for period closing stepper */
export const PERIOD_CLOSING_FLOW_STEPS: PeriodClosingStatus[] = [
  PERIOD_CLOSING_STATUS.OPEN,
  PERIOD_CLOSING_STATUS.LOCKED,
  PERIOD_CLOSING_STATUS.ACCRUALS_POSTED,
  PERIOD_CLOSING_STATUS.RECONCILED,
  PERIOD_CLOSING_STATUS.CLOSED,
  PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED,
];

// ============================================================
//  QUOTE-TO-CASH (Oracle + Zoho inspired)
// ============================================================
//
//  Flow: Lead → Opportunity → Price Rules → Quote Generated →
//        Discount Approval → Quote Accepted → Sales Order →
//        Fulfillment → Invoice Posted → Revenue Recognized
//
//  Maps to a parallel `q2cStatus` field on SaleOrder, sitting
//  alongside the existing document `status`.

export const Q2C_STATUS = {
  LEAD: "lead",
  OPPORTUNITY: "opportunity",
  PRICE_APPLIED: "price_applied",
  QUOTE_GENERATED: "quote_generated",
  DISCOUNT_APPROVAL: "discount_approval",
  QUOTE_ACCEPTED: "quote_accepted",
  SALES_ORDER: "sales_order",
  FULFILLMENT: "fulfillment",
  INVOICE_POSTED: "invoice_posted",
  REVENUE_RECOGNIZED: "revenue_recognized",
  LOST: "lost",
  CANCELLED: "cancelled",
} as const;
export const Q2C_STATUS_VALUES = Object.values(Q2C_STATUS);
export type Q2CStatus = (typeof Q2C_STATUS)[keyof typeof Q2C_STATUS];

/** Valid transitions for the Quote-to-Cash pipeline */
export const Q2C_STATUS_TRANSITIONS: Record<Q2CStatus, Q2CStatus[]> = {
  [Q2C_STATUS.LEAD]: [
    Q2C_STATUS.OPPORTUNITY,
    Q2C_STATUS.LOST,
    Q2C_STATUS.CANCELLED,
  ],
  [Q2C_STATUS.OPPORTUNITY]: [
    Q2C_STATUS.PRICE_APPLIED,
    Q2C_STATUS.LOST,
    Q2C_STATUS.CANCELLED,
  ],
  [Q2C_STATUS.PRICE_APPLIED]: [
    Q2C_STATUS.QUOTE_GENERATED,
    Q2C_STATUS.CANCELLED,
  ],
  [Q2C_STATUS.QUOTE_GENERATED]: [
    Q2C_STATUS.DISCOUNT_APPROVAL,
    Q2C_STATUS.QUOTE_ACCEPTED, // skip approval when no discount
    Q2C_STATUS.LOST,
    Q2C_STATUS.CANCELLED,
  ],
  [Q2C_STATUS.DISCOUNT_APPROVAL]: [
    Q2C_STATUS.QUOTE_ACCEPTED,
    Q2C_STATUS.QUOTE_GENERATED, // rejected → revise quote
    Q2C_STATUS.LOST,
    Q2C_STATUS.CANCELLED,
  ],
  [Q2C_STATUS.QUOTE_ACCEPTED]: [Q2C_STATUS.SALES_ORDER, Q2C_STATUS.CANCELLED],
  [Q2C_STATUS.SALES_ORDER]: [Q2C_STATUS.FULFILLMENT, Q2C_STATUS.CANCELLED],
  [Q2C_STATUS.FULFILLMENT]: [Q2C_STATUS.INVOICE_POSTED, Q2C_STATUS.CANCELLED],
  [Q2C_STATUS.INVOICE_POSTED]: [Q2C_STATUS.REVENUE_RECOGNIZED],
  [Q2C_STATUS.REVENUE_RECOGNIZED]: [], // terminal
  [Q2C_STATUS.LOST]: [Q2C_STATUS.LEAD], // re-open lost deals
  [Q2C_STATUS.CANCELLED]: [],
};

/** Check whether moving from `current` → `next` is a valid Q2C transition */
export function isValidQ2CTransition(
  current: Q2CStatus,
  next: Q2CStatus,
): boolean {
  return (Q2C_STATUS_TRANSITIONS[current] ?? []).includes(next);
}

/** Return the list of Q2C statuses reachable from `current` */
export function getNextQ2CStatuses(current: Q2CStatus): Q2CStatus[] {
  return Q2C_STATUS_TRANSITIONS[current] ?? [];
}

/** Human-readable labels for Q2C statuses */
export const Q2C_STATUS_LABELS: Record<Q2CStatus, string> = {
  [Q2C_STATUS.LEAD]: "Lead Created",
  [Q2C_STATUS.OPPORTUNITY]: "Opportunity Qualified",
  [Q2C_STATUS.PRICE_APPLIED]: "Price Rules Applied",
  [Q2C_STATUS.QUOTE_GENERATED]: "Quote Generated",
  [Q2C_STATUS.DISCOUNT_APPROVAL]: "Discount Approval",
  [Q2C_STATUS.QUOTE_ACCEPTED]: "Quote Accepted",
  [Q2C_STATUS.SALES_ORDER]: "Sales Order Created",
  [Q2C_STATUS.FULFILLMENT]: "Fulfillment Triggered",
  [Q2C_STATUS.INVOICE_POSTED]: "Invoice Posted",
  [Q2C_STATUS.REVENUE_RECOGNIZED]: "Revenue Recognized",
  [Q2C_STATUS.LOST]: "Lost",
  [Q2C_STATUS.CANCELLED]: "Cancelled",
};

/** Tailwind-friendly badge colours for Q2C statuses */
export const Q2C_STATUS_COLORS: Record<
  Q2CStatus,
  { bg: string; text: string }
> = {
  [Q2C_STATUS.LEAD]: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
  },
  [Q2C_STATUS.OPPORTUNITY]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [Q2C_STATUS.PRICE_APPLIED]: {
    bg: "bg-indigo-100 dark:bg-indigo-900",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  [Q2C_STATUS.QUOTE_GENERATED]: {
    bg: "bg-cyan-100 dark:bg-cyan-900",
    text: "text-cyan-700 dark:text-cyan-300",
  },
  [Q2C_STATUS.DISCOUNT_APPROVAL]: {
    bg: "bg-yellow-100 dark:bg-yellow-900",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  [Q2C_STATUS.QUOTE_ACCEPTED]: {
    bg: "bg-emerald-100 dark:bg-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  [Q2C_STATUS.SALES_ORDER]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [Q2C_STATUS.FULFILLMENT]: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
  [Q2C_STATUS.INVOICE_POSTED]: {
    bg: "bg-purple-100 dark:bg-purple-900",
    text: "text-purple-700 dark:text-purple-300",
  },
  [Q2C_STATUS.REVENUE_RECOGNIZED]: {
    bg: "bg-teal-100 dark:bg-teal-900",
    text: "text-teal-700 dark:text-teal-300",
  },
  [Q2C_STATUS.LOST]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [Q2C_STATUS.CANCELLED]: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-500",
  },
};

/** Ordered step list for the Q2C flow progress indicator (happy path, excludes branching) */
export const Q2C_FLOW_STEPS: Q2CStatus[] = [
  Q2C_STATUS.LEAD,
  Q2C_STATUS.OPPORTUNITY,
  Q2C_STATUS.PRICE_APPLIED,
  Q2C_STATUS.QUOTE_GENERATED,
  Q2C_STATUS.DISCOUNT_APPROVAL,
  Q2C_STATUS.QUOTE_ACCEPTED,
  Q2C_STATUS.SALES_ORDER,
  Q2C_STATUS.FULFILLMENT,
  Q2C_STATUS.INVOICE_POSTED,
  Q2C_STATUS.REVENUE_RECOGNIZED,
];

// ============================================================
//  INVENTORY MOVE ENGINE (Odoo + SAP inspired)
// ============================================================
//
//  Flow: Requested → Source Validated → Destination Assigned →
//        Move Executed → Valuation Updated → Accounting Created
//
//  An inventory move tracks the physical movement of goods
//  between locations / warehouses with full valuation + ledger sync.

export const STOCK_MOVE_STATUS = {
  REQUESTED: "requested",
  SOURCE_VALIDATED: "source_validated",
  DESTINATION_ASSIGNED: "destination_assigned",
  MOVE_EXECUTED: "move_executed",
  VALUATION_UPDATED: "valuation_updated",
  ACCOUNTING_CREATED: "accounting_created",
  CANCELLED: "cancelled",
} as const;
export const STOCK_MOVE_STATUS_VALUES = Object.values(STOCK_MOVE_STATUS);
export type StockMoveStatus =
  (typeof STOCK_MOVE_STATUS)[keyof typeof STOCK_MOVE_STATUS];

/** Valid transitions for the Inventory Move workflow */
export const STOCK_MOVE_TRANSITIONS: Record<
  StockMoveStatus,
  StockMoveStatus[]
> = {
  [STOCK_MOVE_STATUS.REQUESTED]: [
    STOCK_MOVE_STATUS.SOURCE_VALIDATED,
    STOCK_MOVE_STATUS.CANCELLED,
  ],
  [STOCK_MOVE_STATUS.SOURCE_VALIDATED]: [
    STOCK_MOVE_STATUS.DESTINATION_ASSIGNED,
    STOCK_MOVE_STATUS.CANCELLED,
  ],
  [STOCK_MOVE_STATUS.DESTINATION_ASSIGNED]: [
    STOCK_MOVE_STATUS.MOVE_EXECUTED,
    STOCK_MOVE_STATUS.CANCELLED,
  ],
  [STOCK_MOVE_STATUS.MOVE_EXECUTED]: [STOCK_MOVE_STATUS.VALUATION_UPDATED],
  [STOCK_MOVE_STATUS.VALUATION_UPDATED]: [STOCK_MOVE_STATUS.ACCOUNTING_CREATED],
  [STOCK_MOVE_STATUS.ACCOUNTING_CREATED]: [], // terminal
  [STOCK_MOVE_STATUS.CANCELLED]: [],
};

/** Check whether moving from `current` → `next` is a valid stock move transition */
export function isValidStockMoveTransition(
  current: StockMoveStatus,
  next: StockMoveStatus,
): boolean {
  return (STOCK_MOVE_TRANSITIONS[current] ?? []).includes(next);
}

/** Return the list of stock move statuses reachable from `current` */
export function getNextStockMoveStatuses(
  current: StockMoveStatus,
): StockMoveStatus[] {
  return STOCK_MOVE_TRANSITIONS[current] ?? [];
}

/** Human-readable labels for stock move statuses */
export const STOCK_MOVE_STATUS_LABELS: Record<StockMoveStatus, string> = {
  [STOCK_MOVE_STATUS.REQUESTED]: "Move Requested",
  [STOCK_MOVE_STATUS.SOURCE_VALIDATED]: "Source Validated",
  [STOCK_MOVE_STATUS.DESTINATION_ASSIGNED]: "Destination Assigned",
  [STOCK_MOVE_STATUS.MOVE_EXECUTED]: "Move Executed",
  [STOCK_MOVE_STATUS.VALUATION_UPDATED]: "Valuation Updated",
  [STOCK_MOVE_STATUS.ACCOUNTING_CREATED]: "Accounting Created",
  [STOCK_MOVE_STATUS.CANCELLED]: "Cancelled",
};

/** Tailwind-friendly badge colours for stock move statuses */
export const STOCK_MOVE_STATUS_COLORS: Record<
  StockMoveStatus,
  { bg: string; text: string }
> = {
  [STOCK_MOVE_STATUS.REQUESTED]: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
  },
  [STOCK_MOVE_STATUS.SOURCE_VALIDATED]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [STOCK_MOVE_STATUS.DESTINATION_ASSIGNED]: {
    bg: "bg-indigo-100 dark:bg-indigo-900",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  [STOCK_MOVE_STATUS.MOVE_EXECUTED]: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
  [STOCK_MOVE_STATUS.VALUATION_UPDATED]: {
    bg: "bg-emerald-100 dark:bg-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  [STOCK_MOVE_STATUS.ACCOUNTING_CREATED]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [STOCK_MOVE_STATUS.CANCELLED]: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-500",
  },
};

/** Ordered flow steps for the stock move stepper (happy path) */
export const STOCK_MOVE_FLOW_STEPS: StockMoveStatus[] = [
  STOCK_MOVE_STATUS.REQUESTED,
  STOCK_MOVE_STATUS.SOURCE_VALIDATED,
  STOCK_MOVE_STATUS.DESTINATION_ASSIGNED,
  STOCK_MOVE_STATUS.MOVE_EXECUTED,
  STOCK_MOVE_STATUS.VALUATION_UPDATED,
  STOCK_MOVE_STATUS.ACCOUNTING_CREATED,
];

// ============================================================
//  HR / PAYROLL MODULE STATUSES
// ============================================================

// --- Employee Lifecycle Status ---
export const EMPLOYEE_LIFECYCLE_STATUS = {
  CANDIDATE: "candidate",
  ONBOARDING: "onboarding",
  ACTIVE: "active",
  ON_NOTICE: "on_notice",
  EXIT_INITIATED: "exit_initiated",
  CLEARANCE: "clearance",
  EXITED: "exited",
} as const;

export const EMPLOYEE_LIFECYCLE_STATUS_VALUES = Object.values(
  EMPLOYEE_LIFECYCLE_STATUS,
);
export type EmployeeLifecycleStatus =
  (typeof EMPLOYEE_LIFECYCLE_STATUS)[keyof typeof EMPLOYEE_LIFECYCLE_STATUS];

export const EMPLOYEE_LIFECYCLE_TRANSITIONS: Record<
  EmployeeLifecycleStatus,
  EmployeeLifecycleStatus[]
> = {
  [EMPLOYEE_LIFECYCLE_STATUS.CANDIDATE]: [EMPLOYEE_LIFECYCLE_STATUS.ONBOARDING],
  [EMPLOYEE_LIFECYCLE_STATUS.ONBOARDING]: [EMPLOYEE_LIFECYCLE_STATUS.ACTIVE],
  [EMPLOYEE_LIFECYCLE_STATUS.ACTIVE]: [EMPLOYEE_LIFECYCLE_STATUS.ON_NOTICE],
  [EMPLOYEE_LIFECYCLE_STATUS.ON_NOTICE]: [
    EMPLOYEE_LIFECYCLE_STATUS.EXIT_INITIATED,
    EMPLOYEE_LIFECYCLE_STATUS.ACTIVE,
  ],
  [EMPLOYEE_LIFECYCLE_STATUS.EXIT_INITIATED]: [
    EMPLOYEE_LIFECYCLE_STATUS.CLEARANCE,
  ],
  [EMPLOYEE_LIFECYCLE_STATUS.CLEARANCE]: [EMPLOYEE_LIFECYCLE_STATUS.EXITED],
  [EMPLOYEE_LIFECYCLE_STATUS.EXITED]: [],
};

export function isValidEmployeeLifecycleTransition(
  current: EmployeeLifecycleStatus,
  next: EmployeeLifecycleStatus,
): boolean {
  return (EMPLOYEE_LIFECYCLE_TRANSITIONS[current] ?? []).includes(next);
}

export const EMPLOYEE_LIFECYCLE_STATUS_LABELS: Record<
  EmployeeLifecycleStatus,
  string
> = {
  [EMPLOYEE_LIFECYCLE_STATUS.CANDIDATE]: "Candidate",
  [EMPLOYEE_LIFECYCLE_STATUS.ONBOARDING]: "Onboarding",
  [EMPLOYEE_LIFECYCLE_STATUS.ACTIVE]: "Active Employment",
  [EMPLOYEE_LIFECYCLE_STATUS.ON_NOTICE]: "On Notice",
  [EMPLOYEE_LIFECYCLE_STATUS.EXIT_INITIATED]: "Exit Initiated",
  [EMPLOYEE_LIFECYCLE_STATUS.CLEARANCE]: "Clearance",
  [EMPLOYEE_LIFECYCLE_STATUS.EXITED]: "Exited",
};

export const EMPLOYEE_LIFECYCLE_STATUS_COLORS: Record<
  EmployeeLifecycleStatus,
  { bg: string; text: string }
> = {
  [EMPLOYEE_LIFECYCLE_STATUS.CANDIDATE]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [EMPLOYEE_LIFECYCLE_STATUS.ONBOARDING]: {
    bg: "bg-cyan-100 dark:bg-cyan-900",
    text: "text-cyan-700 dark:text-cyan-300",
  },
  [EMPLOYEE_LIFECYCLE_STATUS.ACTIVE]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [EMPLOYEE_LIFECYCLE_STATUS.ON_NOTICE]: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
  [EMPLOYEE_LIFECYCLE_STATUS.EXIT_INITIATED]: {
    bg: "bg-orange-100 dark:bg-orange-900",
    text: "text-orange-700 dark:text-orange-300",
  },
  [EMPLOYEE_LIFECYCLE_STATUS.CLEARANCE]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [EMPLOYEE_LIFECYCLE_STATUS.EXITED]: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-500",
  },
};

export const EMPLOYEE_LIFECYCLE_FLOW_STEPS: EmployeeLifecycleStatus[] = [
  EMPLOYEE_LIFECYCLE_STATUS.CANDIDATE,
  EMPLOYEE_LIFECYCLE_STATUS.ONBOARDING,
  EMPLOYEE_LIFECYCLE_STATUS.ACTIVE,
  EMPLOYEE_LIFECYCLE_STATUS.ON_NOTICE,
  EMPLOYEE_LIFECYCLE_STATUS.EXIT_INITIATED,
  EMPLOYEE_LIFECYCLE_STATUS.CLEARANCE,
  EMPLOYEE_LIFECYCLE_STATUS.EXITED,
];

// --- Payroll Status ---
export const PAYROLL_STATUS = {
  DRAFT: "draft",
  ATTENDANCE_LOCKED: "attendance_locked",
  COMPUTED: "computed",
  REVIEWED: "reviewed",
  APPROVED: "approved",
  DISBURSED: "disbursed",
  POSTED_TO_GL: "posted_to_gl",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export const PAYROLL_STATUS_VALUES = Object.values(PAYROLL_STATUS);
export type PayrollStatus =
  (typeof PAYROLL_STATUS)[keyof typeof PAYROLL_STATUS];

export const PAYROLL_STATUS_TRANSITIONS: Record<
  PayrollStatus,
  PayrollStatus[]
> = {
  [PAYROLL_STATUS.DRAFT]: [
    PAYROLL_STATUS.ATTENDANCE_LOCKED,
    PAYROLL_STATUS.CANCELLED,
  ],
  [PAYROLL_STATUS.ATTENDANCE_LOCKED]: [
    PAYROLL_STATUS.COMPUTED,
    PAYROLL_STATUS.CANCELLED,
  ],
  [PAYROLL_STATUS.COMPUTED]: [
    PAYROLL_STATUS.REVIEWED,
    PAYROLL_STATUS.CANCELLED,
  ],
  [PAYROLL_STATUS.REVIEWED]: [PAYROLL_STATUS.APPROVED, PAYROLL_STATUS.REJECTED],
  [PAYROLL_STATUS.APPROVED]: [PAYROLL_STATUS.DISBURSED],
  [PAYROLL_STATUS.DISBURSED]: [PAYROLL_STATUS.POSTED_TO_GL],
  [PAYROLL_STATUS.POSTED_TO_GL]: [], // terminal
  [PAYROLL_STATUS.REJECTED]: [PAYROLL_STATUS.DRAFT],
  [PAYROLL_STATUS.CANCELLED]: [],
};

export function isValidPayrollTransition(
  current: PayrollStatus,
  next: PayrollStatus,
): boolean {
  return (PAYROLL_STATUS_TRANSITIONS[current] ?? []).includes(next);
}

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  [PAYROLL_STATUS.DRAFT]: "Draft",
  [PAYROLL_STATUS.ATTENDANCE_LOCKED]: "Attendance Locked",
  [PAYROLL_STATUS.COMPUTED]: "Computed",
  [PAYROLL_STATUS.REVIEWED]: "Reviewed",
  [PAYROLL_STATUS.APPROVED]: "Approved",
  [PAYROLL_STATUS.DISBURSED]: "Disbursed",
  [PAYROLL_STATUS.POSTED_TO_GL]: "Posted to GL",
  [PAYROLL_STATUS.REJECTED]: "Rejected",
  [PAYROLL_STATUS.CANCELLED]: "Cancelled",
};

export const PAYROLL_STATUS_COLORS: Record<
  PayrollStatus,
  { bg: string; text: string }
> = {
  [PAYROLL_STATUS.DRAFT]: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
  },
  [PAYROLL_STATUS.ATTENDANCE_LOCKED]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [PAYROLL_STATUS.COMPUTED]: {
    bg: "bg-indigo-100 dark:bg-indigo-900",
    text: "text-indigo-700 dark:text-indigo-300",
  },
  [PAYROLL_STATUS.REVIEWED]: {
    bg: "bg-purple-100 dark:bg-purple-900",
    text: "text-purple-700 dark:text-purple-300",
  },
  [PAYROLL_STATUS.APPROVED]: {
    bg: "bg-emerald-100 dark:bg-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  [PAYROLL_STATUS.DISBURSED]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [PAYROLL_STATUS.POSTED_TO_GL]: {
    bg: "bg-teal-100 dark:bg-teal-900",
    text: "text-teal-700 dark:text-teal-300",
  },
  [PAYROLL_STATUS.REJECTED]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [PAYROLL_STATUS.CANCELLED]: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-500",
  },
};

export const PAYROLL_FLOW_STEPS: PayrollStatus[] = [
  PAYROLL_STATUS.DRAFT,
  PAYROLL_STATUS.ATTENDANCE_LOCKED,
  PAYROLL_STATUS.COMPUTED,
  PAYROLL_STATUS.REVIEWED,
  PAYROLL_STATUS.APPROVED,
  PAYROLL_STATUS.DISBURSED,
  PAYROLL_STATUS.POSTED_TO_GL,
];

// --- Leave Request Status ---
export const LEAVE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export const LEAVE_STATUS_VALUES = Object.values(LEAVE_STATUS);
export type LeaveStatus = (typeof LEAVE_STATUS)[keyof typeof LEAVE_STATUS];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  [LEAVE_STATUS.PENDING]: "Pending",
  [LEAVE_STATUS.APPROVED]: "Approved",
  [LEAVE_STATUS.REJECTED]: "Rejected",
  [LEAVE_STATUS.CANCELLED]: "Cancelled",
};

export const LEAVE_STATUS_COLORS: Record<
  LeaveStatus,
  { bg: string; text: string }
> = {
  [LEAVE_STATUS.PENDING]: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
  [LEAVE_STATUS.APPROVED]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [LEAVE_STATUS.REJECTED]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [LEAVE_STATUS.CANCELLED]: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-500",
  },
};

// --- Attendance Status ---
export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  HALF_DAY: "half-day",
  ON_LEAVE: "on-leave",
  HOLIDAY: "holiday",
  WEEK_OFF: "week-off",
} as const;

export const ATTENDANCE_STATUS_VALUES = Object.values(ATTENDANCE_STATUS);
export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  [ATTENDANCE_STATUS.PRESENT]: "Present",
  [ATTENDANCE_STATUS.ABSENT]: "Absent",
  [ATTENDANCE_STATUS.HALF_DAY]: "Half Day",
  [ATTENDANCE_STATUS.ON_LEAVE]: "On Leave",
  [ATTENDANCE_STATUS.HOLIDAY]: "Holiday",
  [ATTENDANCE_STATUS.WEEK_OFF]: "Week Off",
};

export const ATTENDANCE_STATUS_COLORS: Record<
  AttendanceStatus,
  { bg: string; text: string }
> = {
  [ATTENDANCE_STATUS.PRESENT]: {
    bg: "bg-green-100 dark:bg-green-900",
    text: "text-green-700 dark:text-green-300",
  },
  [ATTENDANCE_STATUS.ABSENT]: {
    bg: "bg-red-100 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
  },
  [ATTENDANCE_STATUS.HALF_DAY]: {
    bg: "bg-amber-100 dark:bg-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
  [ATTENDANCE_STATUS.ON_LEAVE]: {
    bg: "bg-blue-100 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
  },
  [ATTENDANCE_STATUS.HOLIDAY]: {
    bg: "bg-purple-100 dark:bg-purple-900",
    text: "text-purple-700 dark:text-purple-300",
  },
  [ATTENDANCE_STATUS.WEEK_OFF]: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
  },
};
// --------------- Organization Tier ---------------------------
// Subscription tiers that gate feature access and usage limits.
// The tier→limits map lives in lib/constants/tiers.ts (Step 4).
export const ORGANIZATION_TIER = {
  STARTER: "starter",
  PROFESSIONAL: "professional",
  ENTERPRISE: "enterprise",
} as const;
export const ORGANIZATION_TIER_VALUES = Object.values(ORGANIZATION_TIER);
export type OrganizationTier =
  (typeof ORGANIZATION_TIER)[keyof typeof ORGANIZATION_TIER];
export const ORGANIZATION_TIER_LABELS: Record<OrganizationTier, string> = {
  [ORGANIZATION_TIER.STARTER]: "Starter",
  [ORGANIZATION_TIER.PROFESSIONAL]: "Professional",
  [ORGANIZATION_TIER.ENTERPRISE]: "Enterprise",
};

// --------------- Org Invite Status ---------------------------
export const INVITE_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const;
export const INVITE_STATUS_VALUES = Object.values(INVITE_STATUS);
export type InviteStatus = (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];

// --------------- Subscription Event Type ----------------------
export const SUBSCRIPTION_EVENT_TYPE = {
  CREATED: "created",
  UPGRADED: "upgraded",
  DOWNGRADED: "downgraded",
  RENEWED: "renewed",
  PAYMENT_SUCCEEDED: "payment_succeeded",
  PAYMENT_FAILED: "payment_failed",
  CANCELED: "canceled",
} as const;
export const SUBSCRIPTION_EVENT_TYPE_VALUES = Object.values(
  SUBSCRIPTION_EVENT_TYPE,
);
export type SubscriptionEventType =
  (typeof SUBSCRIPTION_EVENT_TYPE)[keyof typeof SUBSCRIPTION_EVENT_TYPE];
// ============================================================
//  BANKING RULES
// ============================================================

export const BANKING_RULE_APPLY_TO = {
  DEPOSITS: "deposits",
  WITHDRAWALS: "withdrawals",
} as const;
export const BANKING_RULE_APPLY_TO_VALUES = Object.values(
  BANKING_RULE_APPLY_TO,
);
export type BankingRuleApplyTo =
  (typeof BANKING_RULE_APPLY_TO)[keyof typeof BANKING_RULE_APPLY_TO];

export const BANKING_RULE_TRANSACTION_HANDLING = {
  RECOGNIZED: "recognized",
  CATEGORIZED: "categorized",
} as const;
export const BANKING_RULE_TRANSACTION_HANDLING_VALUES = Object.values(
  BANKING_RULE_TRANSACTION_HANDLING,
);
export type BankingRuleTransactionHandling =
  (typeof BANKING_RULE_TRANSACTION_HANDLING)[keyof typeof BANKING_RULE_TRANSACTION_HANDLING];

export const BANKING_RULE_CRITERIA_MATCH = {
  ANY: "any",
  ALL: "all",
} as const;
export const BANKING_RULE_CRITERIA_MATCH_VALUES = Object.values(
  BANKING_RULE_CRITERIA_MATCH,
);
export type BankingRuleCriteriaMatch =
  (typeof BANKING_RULE_CRITERIA_MATCH)[keyof typeof BANKING_RULE_CRITERIA_MATCH];

export const BANKING_RULE_RECORD_AS = {
  EXPENSE: "expense",
  INCOME: "income",
  TRANSFER: "transfer",
  CREDIT_CARD_PAYMENT: "credit_card_payment",
  OWNER_DRAWINGS: "owner_drawings",
  OWNER_CONTRIBUTION: "owner_contribution",
} as const;
export const BANKING_RULE_RECORD_AS_VALUES = Object.values(
  BANKING_RULE_RECORD_AS,
);
export type BankingRuleRecordAs =
  (typeof BANKING_RULE_RECORD_AS)[keyof typeof BANKING_RULE_RECORD_AS];

export const BANKING_RULE_ASSOCIATE_MODE = {
  ALL_ACCOUNTS: "all_accounts",
  ALL_BANKS: "all_banks",
  ALL_CARDS: "all_cards",
  CUSTOM: "custom",
} as const;
export const BANKING_RULE_ASSOCIATE_MODE_VALUES = Object.values(
  BANKING_RULE_ASSOCIATE_MODE,
);
export type BankingRuleAssociateMode =
  (typeof BANKING_RULE_ASSOCIATE_MODE)[keyof typeof BANKING_RULE_ASSOCIATE_MODE];

// Record-As values that are only valid for card-based accounts — disables "All Banks" association
export const BANKING_RULE_RECORD_AS_DISABLES: Partial<
  Record<BankingRuleRecordAs, BankingRuleAssociateMode[]>
> = {
  [BANKING_RULE_RECORD_AS.CREDIT_CARD_PAYMENT]: [
    BANKING_RULE_ASSOCIATE_MODE.ALL_BANKS,
  ],
  [BANKING_RULE_RECORD_AS.OWNER_DRAWINGS]: [
    BANKING_RULE_ASSOCIATE_MODE.ALL_CARDS,
  ],
  [BANKING_RULE_RECORD_AS.OWNER_CONTRIBUTION]: [
    BANKING_RULE_ASSOCIATE_MODE.ALL_CARDS,
  ],
};

export const BANKING_RULE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export const BANKING_RULE_STATUS_VALUES = Object.values(BANKING_RULE_STATUS);
export type BankingRuleStatus =
  (typeof BANKING_RULE_STATUS)[keyof typeof BANKING_RULE_STATUS];

// ============================================================
//  BUDGETS
// ============================================================

export const BUDGET_PERIOD = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
} as const;
export const BUDGET_PERIOD_VALUES = Object.values(BUDGET_PERIOD);
export type BudgetPeriod = (typeof BUDGET_PERIOD)[keyof typeof BUDGET_PERIOD];

export const BUDGET_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;
export const BUDGET_STATUS_VALUES = Object.values(BUDGET_STATUS);
export type BudgetStatus = (typeof BUDGET_STATUS)[keyof typeof BUDGET_STATUS];

export const BUDGET_SEGMENT = {
  INCOME: "income",
  EXPENSE: "expense",
  ASSET: "asset",
  LIABILITY: "liability",
  EQUITY: "equity",
} as const;
export const BUDGET_SEGMENT_VALUES = Object.values(BUDGET_SEGMENT);
export type BudgetSegment =
  (typeof BUDGET_SEGMENT)[keyof typeof BUDGET_SEGMENT];

// ============================================================
//  TRANSACTION LOCKING
// ============================================================

export const TRANSACTION_LOCK_MODULE = {
  SALES: "sales",
  PURCHASES: "purchases",
  BANKING: "banking",
  ACCOUNTANT: "accountant",
  ALL: "all",
} as const;
export const TRANSACTION_LOCK_MODULE_VALUES = Object.values(
  TRANSACTION_LOCK_MODULE,
);
export type TransactionLockModule =
  (typeof TRANSACTION_LOCK_MODULE)[keyof typeof TRANSACTION_LOCK_MODULE];

// ============================================================
//  ACCOUNTING SETUP / SETTINGS
// ============================================================

export const TAX_RATE_TYPE = {
  GST: "gst",
  IGST: "igst",
  CGST: "cgst",
  SGST: "sgst",
  CESS: "cess",
  TDS: "tds",
  TCS: "tcs",
  OTHER: "other",
} as const;
export const TAX_RATE_TYPE_VALUES = Object.values(TAX_RATE_TYPE);
export type TaxRateType = (typeof TAX_RATE_TYPE)[keyof typeof TAX_RATE_TYPE];

export const CUSTOM_FIELD_TYPE = {
  TEXT: "text",
  NUMBER: "number",
  DATE: "date",
  DROPDOWN: "dropdown",
  CHECKBOX: "checkbox",
} as const;
export const CUSTOM_FIELD_TYPE_VALUES = Object.values(CUSTOM_FIELD_TYPE);
export type CustomFieldType =
  (typeof CUSTOM_FIELD_TYPE)[keyof typeof CUSTOM_FIELD_TYPE];

export const CUSTOM_FIELD_APPLIES_TO = {
  ACCOUNT: "account",
  JOURNAL: "journal",
} as const;
export const CUSTOM_FIELD_APPLIES_TO_VALUES = Object.values(
  CUSTOM_FIELD_APPLIES_TO,
);
export type CustomFieldAppliesTo =
  (typeof CUSTOM_FIELD_APPLIES_TO)[keyof typeof CUSTOM_FIELD_APPLIES_TO];

export const JOURNAL_APPROVAL_THRESHOLD_ACTION = {
  REQUIRE_APPROVAL: "require_approval",
  NONE: "none",
} as const;
export const JOURNAL_APPROVAL_THRESHOLD_ACTION_VALUES = Object.values(
  JOURNAL_APPROVAL_THRESHOLD_ACTION,
);

// ============================================================
//  AI ACTION CONFIRMATION GATE (accounting module)
// ============================================================

export const AI_ACTION_STATUS = {
  PROPOSED: "proposed",
  CONFIRMED: "confirmed",
  EXECUTED: "executed",
  REJECTED: "rejected",
  EXPIRED: "expired",
} as const;
export const AI_ACTION_STATUS_VALUES = Object.values(AI_ACTION_STATUS);
export type AiActionStatus =
  (typeof AI_ACTION_STATUS)[keyof typeof AI_ACTION_STATUS];

export const AI_ACTION_TYPE = {
  CREATE_ACCOUNT: "create_account",
  UPDATE_ACCOUNT: "update_account",
  DELETE_ACCOUNT: "delete_account",
  LOCK_TRANSACTIONS: "lock_transactions",
  UNLOCK_TRANSACTIONS: "unlock_transactions",
  CREATE_BUDGET: "create_budget",
  CREATE_BANKING_RULE: "create_banking_rule",
} as const;
export const AI_ACTION_TYPE_VALUES = Object.values(AI_ACTION_TYPE);
export type AiActionType = (typeof AI_ACTION_TYPE)[keyof typeof AI_ACTION_TYPE];

// ============================================================
//  BANK ACCOUNTS (manual + connected feeds)
// ============================================================

export const BANK_ACCOUNT_TYPE = {
  BANK: "bank",
  CREDIT_CARD: "credit_card",
} as const;
export const BANK_ACCOUNT_TYPE_VALUES = Object.values(BANK_ACCOUNT_TYPE);
export type BankAccountType =
  (typeof BANK_ACCOUNT_TYPE)[keyof typeof BANK_ACCOUNT_TYPE];

export const BANK_ACCOUNT_CONNECTION_STATUS = {
  MANUAL: "manual",
  PENDING: "pending",
  CONNECTED: "connected",
} as const;
export const BANK_ACCOUNT_CONNECTION_STATUS_VALUES = Object.values(
  BANK_ACCOUNT_CONNECTION_STATUS,
);
export type BankAccountConnectionStatus =
  (typeof BANK_ACCOUNT_CONNECTION_STATUS)[keyof typeof BANK_ACCOUNT_CONNECTION_STATUS];

// ============================================================
//  JOURNAL TEMPLATES & CURRENCY ADJUSTMENTS
// ============================================================

export const JOURNAL_REPORTING_METHOD = {
  ACCRUAL_AND_CASH: "accrual_and_cash",
  ACCRUAL_ONLY: "accrual_only",
  CASH_ONLY: "cash_only",
} as const;
export const JOURNAL_REPORTING_METHOD_VALUES = Object.values(
  JOURNAL_REPORTING_METHOD,
);
export type JournalReportingMethod =
  (typeof JOURNAL_REPORTING_METHOD)[keyof typeof JOURNAL_REPORTING_METHOD];

export const CURRENCY_ADJUSTMENT_FILTER = {
  ALL: "all",
  TODAY: "today",
  THIS_WEEK: "this_week",
  THIS_MONTH: "this_month",
  THIS_QUARTER: "this_quarter",
  THIS_YEAR: "this_year",
} as const;
export const CURRENCY_ADJUSTMENT_FILTER_VALUES = Object.values(
  CURRENCY_ADJUSTMENT_FILTER,
);
