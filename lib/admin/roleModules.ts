export const USER_ROLE_OPTIONS = [
  { value: "admin", label: "Admin", module: "admin" },
  { value: "hr-manager", label: "HR Manager", module: "hr" },
  { value: "hr-staff", label: "HR Staff", module: "hr" },
  { value: "inventory-manager", label: "Inventory Manager", module: "inventory" },
  { value: "inventory-staff", label: "Inventory Staff", module: "inventory" },
  { value: "finance-manager", label: "Finance Manager", module: "finance" },
  { value: "accountant", label: "Accountant", module: "finance" },
  { value: "sales-manager", label: "Sales Manager", module: "sales" },
  { value: "sales-executive", label: "Sales Executive", module: "sales" },
  { value: "production-manager", label: "Production Manager", module: "manufacturing" },
  { value: "production-staff", label: "Production Staff", module: "manufacturing" },
  { value: "crm-manager", label: "CRM Manager", module: "crm" },
  { value: "crm-executive", label: "CRM Executive", module: "crm" },
  { value: "project-manager", label: "Project Manager", module: "project" },
  { value: "project-member", label: "Project Member", module: "project" },
] as const;

export type UserRoleOption = (typeof USER_ROLE_OPTIONS)[number];
export type UserRoleValue = UserRoleOption["value"];
export type UserModuleRole = UserRoleOption["module"];

// Module-level roles remain valid for existing integrations and user records.
export const VALID_USER_ROLES: readonly string[] = [
  ...USER_ROLE_OPTIONS.map((role) => role.value),
  ...new Set(USER_ROLE_OPTIONS.map((role) => role.module)),
];

export function getUserRoleOption(role: string): UserRoleOption | undefined {
  return USER_ROLE_OPTIONS.find((option) => option.value === role)
    ?? USER_ROLE_OPTIONS.find((option) => option.module === role);
}

export function getUserRoleLabel(role: string): string {
  return USER_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export function filterRolesByModules(modules: readonly string[] | undefined | null): UserRoleOption[] {
  const moduleSet = new Set(modules ?? []);
  return USER_ROLE_OPTIONS.filter((role) => moduleSet.has(role.module));
}

export function isRoleEnabledForModules(role: string, modules: readonly string[] | undefined | null): boolean {
  const option = getUserRoleOption(role);
  return !!option && !!modules?.includes(option.module);
}
