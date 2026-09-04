/**
 * Hard Rule 4 / Part 2.3: actions that are NEVER_AUTONOMOUS, full stop. This
 * list is not tenant-configurable — a tenant policy cannot raise these into
 * any autonomous tier. `decideAutonomy()` checks this list first, before any
 * of the seven gate checks, and the tool registry's `callTool()` checks it
 * again independently so a bug in the gate cannot let one through — a
 * `NEVER_AUTONOMOUS` action must fail closed even if every other check
 * would have passed.
 */
export const NEVER_AUTONOMOUS_ACTION_CLASSES = [
  "release_payment",
  "change_vendor_bank_details",
  "submit_statutory_filing",
  "change_tax_rule",
  "change_accounting_rule",
  "close_period",
  "lock_period",
] as const;

export type NeverAutonomousActionClass = (typeof NEVER_AUTONOMOUS_ACTION_CLASSES)[number];

export function isNeverAutonomous(actionClass: string): boolean {
  return (NEVER_AUTONOMOUS_ACTION_CLASSES as readonly string[]).includes(actionClass);
}
