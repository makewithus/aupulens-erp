/**
 * Aupulens Studio (vNext Expansion Module 5 — Visual ERP Builder) — pure
 * condition evaluation + template interpolation.
 *
 * No DB/AI imports so the decision logic is fully unit-testable. The operators
 * mirror the existing CRM automation engine (lib/crm/automationEngine) so
 * behaviour is consistent across the two systems.
 */

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "exists"
  | "not_exists";

export interface WorkflowCondition {
  field: string; // dot path into the payload/context
  operator: ConditionOperator;
  value?: unknown;
}

export const CONDITION_OPERATORS: ConditionOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "exists",
  "not_exists",
];

/** Safe dot-path lookup: getPath({a:{b:1}}, "a.b") === 1. */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function compare(fieldValue: unknown, operator: ConditionOperator, value: unknown): boolean {
  switch (operator) {
    case "equals":
      return fieldValue === value || String(fieldValue) === String(value);
    case "not_equals":
      return !(fieldValue === value || String(fieldValue) === String(value));
    case "contains":
      return String(fieldValue ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
    case "greater_than":
      return Number(fieldValue) > Number(value);
    case "less_than":
      return Number(fieldValue) < Number(value);
    case "exists":
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
    case "not_exists":
      return fieldValue === undefined || fieldValue === null || fieldValue === "";
    default:
      return false;
  }
}

/**
 * All conditions must pass (AND). An empty condition list always passes — a
 * workflow with no conditions runs on every matching trigger.
 */
export function evaluateConditions(conditions: WorkflowCondition[], payload: unknown): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => compare(getPath(payload, c.field), c.operator, c.value));
}

/**
 * Replace {{dot.path}} tokens in a string using values from `context`. Missing
 * paths render as an empty string (never "undefined"). Non-string inputs are
 * returned unchanged.
 */
export function interpolate(template: string, context: unknown): string {
  if (typeof template !== "string") return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
    const v = getPath(context, path);
    return v === undefined || v === null ? "" : String(v);
  });
}
