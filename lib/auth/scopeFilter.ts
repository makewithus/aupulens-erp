/**
 * Admin-Only Demo Data Scope Filter
 *
 * Implements server-side data isolation between authorized Admin users and standard
 * non-admin portal roles (e.g., Sales, HR, Inventory).
 *
 * - Authorized Admin users (role: "admin" or "master-admin") have access to inspect
 *   both genuine production-like data and seeded prototype/demo data across all 7 modules.
 * - Non-admin users are strictly quarantined from prototype/demo records:
 *   queries automatically append `{ isDemo: { $ne: true } }`, and single-item lookups
 *   for demo records return false (triggering 404/403).
 */

export function isAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "master-admin";
}

export function isAdminSession(session: any): boolean {
  const role = session?.user?.role;
  return isAdminRole(role);
}

/**
 * Appends the appropriate `{ isDemo: { $ne: true } }` constraint to MongoDB queries
 * when caller is a non-admin user. Admins receive the original query unmodified.
 */
export function applyDemoScope<T extends Record<string, any>>(
  session: any,
  query: T = {} as T,
): T & { isDemo?: any } {
  if (isAdminSession(session)) {
    return query;
  }
  return {
    ...query,
    isDemo: { $ne: true },
  };
}

/**
 * Checks whether the current session is authorized to view/mutate the given document.
 * If the document is marked as demo data (`isDemo === true`), access is granted ONLY
 * to admins.
 */
export function canAccessDemoDoc(session: any, doc: any): boolean {
  if (!doc) return false;
  if (!doc.isDemo) return true;
  return isAdminSession(session);
}

/**
 * Generates a role-partitioned cache segment to prevent cache-poisoning between
 * admin queries (which include demo data) and non-admin queries (which exclude it).
 */
export function getDemoCacheSegment(session: any): string {
  return isAdminSession(session) ? "scope:admin" : "scope:standard";
}
