/**
 * Universal ERP Migration Platform — feature-local constants.
 *
 * These enums are intentionally kept out of lib/constants/statuses.ts: that file
 * is the shared business-workflow state machine (draft/approved/posted/...) and
 * Golden Rule #8 warns against churning it. Migration job lifecycle is a
 * self-contained feature concern, so its enums live here.
 */

export const MIGRATION_JOB_STATUS = {
  CREATED: "created", // file uploaded + parsed, no mapping yet
  MAPPED: "mapped", // field mapping saved
  VALIDATED: "validated", // validation run
  PREVIEWED: "previewed", // sandbox dry-run done
  IMPORTED: "imported", // records written to live collections
  ROLLED_BACK: "rolled_back", // imported records deleted again
  FAILED: "failed",
} as const;

export type MigrationJobStatus =
  (typeof MIGRATION_JOB_STATUS)[keyof typeof MIGRATION_JOB_STATUS];

export const MIGRATION_JOB_STATUS_VALUES = Object.values(MIGRATION_JOB_STATUS);

/**
 * Source systems we advertise support for. The parser is format-driven
 * (Excel/CSV/JSON/XML), so a "Tally" export and a "Zoho" export both flow
 * through the same adapters — the sourceSystem is metadata + drives which
 * default alias hints the mapper leans on, not a separate parser per vendor.
 */
export const MIGRATION_SOURCE_SYSTEM = {
  TALLY: "tally",
  SAP_B1: "sap_b1",
  NETSUITE: "netsuite",
  DYNAMICS: "dynamics",
  ZOHO: "zoho",
  ERPNEXT: "erpnext",
  ODOO: "odoo",
  BUSY: "busy",
  MARG: "marg",
  QUICKBOOKS: "quickbooks",
  EXCEL: "excel",
  CSV: "csv",
  JSON: "json",
  XML: "xml",
  OTHER: "other",
} as const;

export type MigrationSourceSystem =
  (typeof MIGRATION_SOURCE_SYSTEM)[keyof typeof MIGRATION_SOURCE_SYSTEM];

export const MIGRATION_SOURCE_SYSTEM_VALUES = Object.values(
  MIGRATION_SOURCE_SYSTEM,
);

/**
 * Entities importable in this version. Deliberately scoped to the three
 * lowest-risk, highest-value master-data entities for a new-tenant onboarding
 * (Customers, Vendors, Products). Transactional entities (Invoices, Journals,
 * Stock) are the documented next increment — they need reference resolution
 * (customer/account lookups) that master data must exist for first.
 */
export const MIGRATION_ENTITY = {
  CUSTOMER: "customer",
  VENDOR: "vendor",
  PRODUCT: "product",
} as const;

export type MigrationEntity =
  (typeof MIGRATION_ENTITY)[keyof typeof MIGRATION_ENTITY];

export const MIGRATION_ENTITY_VALUES = Object.values(MIGRATION_ENTITY);

/**
 * Hard cap on rows persisted onto a single MigrationJob document. MongoDB's
 * 16MB document ceiling means we can't stash an unbounded source file inside
 * the job; 20k master-data rows is comfortably under that and well past any
 * realistic single-entity onboarding file. Files larger than this are rejected
 * at parse time with a clear message rather than silently truncated.
 */
export const MIGRATION_MAX_ROWS = 20000;
