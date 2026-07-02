// --------------- Organization Tier ---------------------------
// Subscription tiers that gate feature access and usage limits.
// The tier→limits map lives in lib/constants/tiers.ts (Step 4).

export const ORGANIZATION_TIER = {
  STARTER:      "starter",
  PROFESSIONAL: "professional",
  ENTERPRISE:   "enterprise",
} as const;

export const ORGANIZATION_TIER_VALUES = Object.values(ORGANIZATION_TIER);

export type OrganizationTier =
  (typeof ORGANIZATION_TIER)[keyof typeof ORGANIZATION_TIER];

export const ORGANIZATION_TIER_LABELS: Record<OrganizationTier, string> = {
  [ORGANIZATION_TIER.STARTER]:      "Starter",
  [ORGANIZATION_TIER.PROFESSIONAL]: "Professional",
  [ORGANIZATION_TIER.ENTERPRISE]:   "Enterprise",
};

// --------------- Org Invite Status ---------------------------

export const INVITE_STATUS = {
  PENDING:  "pending",
  ACCEPTED: "accepted",
  EXPIRED:  "expired",
  REVOKED:  "revoked",
} as const;

export const INVITE_STATUS_VALUES = Object.values(INVITE_STATUS);

export type InviteStatus =
  (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];

// --------------- Subscription Event Type ----------------------

export const SUBSCRIPTION_EVENT_TYPE = {
  CREATED:           "created",
  UPGRADED:          "upgraded",
  DOWNGRADED:        "downgraded",
  RENEWED:           "renewed",
  PAYMENT_SUCCEEDED: "payment_succeeded",
  PAYMENT_FAILED:    "payment_failed",
  CANCELED:          "canceled",
} as const;

export const SUBSCRIPTION_EVENT_TYPE_VALUES = Object.values(SUBSCRIPTION_EVENT_TYPE);

export type SubscriptionEventType =
  (typeof SUBSCRIPTION_EVENT_TYPE)[keyof typeof SUBSCRIPTION_EVENT_TYPE];

// ============================================================
//  BANKING RULES
// ============================================================

export const BANKING_RULE_APPLY_TO = {
  DEPOSITS: "deposits",
  WITHDRAWALS: "withdrawals",
} as const;
export const BANKING_RULE_APPLY_TO_VALUES = Object.values(BANKING_RULE_APPLY_TO);
export type BankingRuleApplyTo = (typeof BANKING_RULE_APPLY_TO)[keyof typeof BANKING_RULE_APPLY_TO];

export const BANKING_RULE_TRANSACTION_HANDLING = {
  RECOGNIZED: "recognized",
  CATEGORIZED: "categorized",
} as const;
export const BANKING_RULE_TRANSACTION_HANDLING_VALUES = Object.values(BANKING_RULE_TRANSACTION_HANDLING);
export type BankingRuleTransactionHandling = (typeof BANKING_RULE_TRANSACTION_HANDLING)[keyof typeof BANKING_RULE_TRANSACTION_HANDLING];

export const BANKING_RULE_CRITERIA_MATCH = {
  ANY: "any",
  ALL: "all",
} as const;
export const BANKING_RULE_CRITERIA_MATCH_VALUES = Object.values(BANKING_RULE_CRITERIA_MATCH);
export type BankingRuleCriteriaMatch = (typeof BANKING_RULE_CRITERIA_MATCH)[keyof typeof BANKING_RULE_CRITERIA_MATCH];

export const BANKING_RULE_RECORD_AS = {
  EXPENSE: "expense",
  INCOME: "income",
  TRANSFER: "transfer",
  CREDIT_CARD_PAYMENT: "credit_card_payment",
  OWNER_DRAWINGS: "owner_drawings",
  OWNER_CONTRIBUTION: "owner_contribution",
} as const;
export const BANKING_RULE_RECORD_AS_VALUES = Object.values(BANKING_RULE_RECORD_AS);
export type BankingRuleRecordAs = (typeof BANKING_RULE_RECORD_AS)[keyof typeof BANKING_RULE_RECORD_AS];

export const BANKING_RULE_ASSOCIATE_MODE = {
  ALL_ACCOUNTS: "all_accounts",
  ALL_BANKS: "all_banks",
  ALL_CARDS: "all_cards",
  CUSTOM: "custom",
} as const;
export const BANKING_RULE_ASSOCIATE_MODE_VALUES = Object.values(BANKING_RULE_ASSOCIATE_MODE);
export type BankingRuleAssociateMode = (typeof BANKING_RULE_ASSOCIATE_MODE)[keyof typeof BANKING_RULE_ASSOCIATE_MODE];

// Record-As values that are only valid for card-based accounts — disables "All Banks" association
export const BANKING_RULE_RECORD_AS_DISABLES: Partial<Record<BankingRuleRecordAs, BankingRuleAssociateMode[]>> = {
  [BANKING_RULE_RECORD_AS.CREDIT_CARD_PAYMENT]: [BANKING_RULE_ASSOCIATE_MODE.ALL_BANKS],
  [BANKING_RULE_RECORD_AS.OWNER_DRAWINGS]: [BANKING_RULE_ASSOCIATE_MODE.ALL_CARDS],
  [BANKING_RULE_RECORD_AS.OWNER_CONTRIBUTION]: [BANKING_RULE_ASSOCIATE_MODE.ALL_CARDS],
};

export const BANKING_RULE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export const BANKING_RULE_STATUS_VALUES = Object.values(BANKING_RULE_STATUS);
export type BankingRuleStatus = (typeof BANKING_RULE_STATUS)[keyof typeof BANKING_RULE_STATUS];

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
export type BudgetSegment = (typeof BUDGET_SEGMENT)[keyof typeof BUDGET_SEGMENT];

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
export const TRANSACTION_LOCK_MODULE_VALUES = Object.values(TRANSACTION_LOCK_MODULE);
export type TransactionLockModule = (typeof TRANSACTION_LOCK_MODULE)[keyof typeof TRANSACTION_LOCK_MODULE];

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
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPE)[keyof typeof CUSTOM_FIELD_TYPE];

export const CUSTOM_FIELD_APPLIES_TO = {
  ACCOUNT: "account",
  JOURNAL: "journal",
} as const;
export const CUSTOM_FIELD_APPLIES_TO_VALUES = Object.values(CUSTOM_FIELD_APPLIES_TO);
export type CustomFieldAppliesTo = (typeof CUSTOM_FIELD_APPLIES_TO)[keyof typeof CUSTOM_FIELD_APPLIES_TO];

export const JOURNAL_APPROVAL_THRESHOLD_ACTION = {
  REQUIRE_APPROVAL: "require_approval",
  NONE: "none",
} as const;
export const JOURNAL_APPROVAL_THRESHOLD_ACTION_VALUES = Object.values(JOURNAL_APPROVAL_THRESHOLD_ACTION);

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
export type AiActionStatus = (typeof AI_ACTION_STATUS)[keyof typeof AI_ACTION_STATUS];

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