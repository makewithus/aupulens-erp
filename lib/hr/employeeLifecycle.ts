/** Lifecycle states that still belong to the current workforce. */
export const CURRENT_EMPLOYEE_LIFECYCLE_STATUSES = ["active", "on_notice"] as const;

/** Mongo filter shared by HR summaries and analytics for current employees. */
export function currentEmployeeFilter(tenantId: string) {
  return {
    tenantId,
    $or: [
      { lifecycleStatus: { $in: [...CURRENT_EMPLOYEE_LIFECYCLE_STATUSES] } },
      { lifecycleStatus: { $exists: false }, status: "active" },
    ],
  };
}

export function onboardingEmployeeFilter(tenantId: string) {
  return {
    tenantId,
    $or: [
      { lifecycleStatus: "onboarding" },
      { lifecycleStatus: { $exists: false }, status: "onboarding" },
    ],
  };
}

export function isCurrentEmployee(employee: { lifecycleStatus?: string; status?: string }) {
  return CURRENT_EMPLOYEE_LIFECYCLE_STATUSES.includes(employee.lifecycleStatus as any) ||
    (!employee.lifecycleStatus && employee.status === "active");
}
