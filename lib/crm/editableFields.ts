import { stripProtectedFields } from "@/lib/api/validateId";
const FIELDS = {
  account: ["company_name", "type", "industry", "size", "website", "billing_address", "shipping_address", "tax_id", "owner_id", "status", "source", "relationship_value", "segment", "tags"],
  lead: ["lead_name", "company_name", "phone", "email", "source", "owner_id", "status", "industry", "location", "interest_category", "service_product_interest", "budget_range", "expected_timeline", "priority", "notes", "tags", "assigned_team_member_id", "next_followup_date", "disqualification_reason", "campaign_id"],
  task: ["title", "category", "description", "assigned_to_id", "due_date", "priority", "status", "is_recurring", "recurrence_rule", "linked_lead_id", "linked_account_id", "linked_opportunity_id", "linked_case_id"],
} as const;
/** Explicit model-specific edit contracts. Conversion, scoring, completion and audit metadata are server-owned. */
export function crmEditableFields(kind: keyof typeof FIELDS, payload: Record<string, any>) {
  const clean = stripProtectedFields(payload);
  return Object.fromEntries(FIELDS[kind].filter(key => Object.hasOwn(clean,key)).map(key => [key, clean[key]]));
}
