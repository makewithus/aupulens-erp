/**
 * CRM automation-rule vocabulary — the single source of truth for the allowed
 * trigger / entity / operator / action values the automation engine understands.
 *
 * Deliberately dependency-free (no imports) so it's safe to import from BOTH
 * server code (lib/crm/ai/nlToRule.ts) AND client components
 * (components/crm/VisualWorkflowBuilder.tsx) without dragging the Node-only AI
 * client (undici / node:crypto) into the browser bundle.
 */
export const RULE_TRIGGERS = [
  "record_created", "field_changed", "stage_changed", "date_reached", "approval_completed",
  "quote_accepted", "quote_rejected", "no_activity", "task_overdue", "sla_breached", "contract_expiring",
] as const;

export const RULE_ENTITIES = ["Lead", "Opportunity", "Account", "Quote", "Contract", "Case"] as const;

export const RULE_OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than", "exists", "date_before", "date_after"] as const;

export const RULE_ACTIONS = [
  "create_task", "send_notification", "update_field", "change_status", "assign_owner",
  "create_related_record", "add_tag", "trigger_approval", "send_email", "send_whatsapp", "send_sms", "create_activity",
] as const;
