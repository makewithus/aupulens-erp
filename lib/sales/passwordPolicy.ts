// Single source of truth for the "File Protection Password" policy used by
// every export dialog across the Sales module (Sales Orders, Payments, and
// any future entity). Previously duplicated verbatim in each dialog/route;
// consolidated here so client and server always validate the same rule.
export const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

export const PASSWORD_POLICY_HELP_TEXT =
  "At least 12 characters, including one uppercase, one lowercase, one number, and one special character.";

export function isValidExportPassword(password: string): boolean {
  return PASSWORD_POLICY.test(password);
}
