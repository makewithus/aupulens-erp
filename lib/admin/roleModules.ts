export const USER_ROLE_OPTIONS = [
  { value: "admin", label: "Admin", module: "admin" },
  { value: "finance", label: "Finance", module: "finance" },
  { value: "hr", label: "HR", module: "hr" },
  { value: "sales", label: "Sales", module: "sales" },
  { value: "inventory", label: "Inventory", module: "inventory" },
  { value: "project", label: "Project", module: "project" },
  { value: "manufacturing", label: "Manufacturing", module: "manufacturing" },
] as const;

export type UserRoleOption = (typeof USER_ROLE_OPTIONS)[number];

export const VALID_USER_ROLES = USER_ROLE_OPTIONS.map((role) => role.value);

export function filterRolesByModules(modules: readonly string[] | undefined | null): UserRoleOption[] {
  if (!modules || modules.length === 0) return USER_ROLE_OPTIONS.filter((role) => role.value === "admin");
  const moduleSet = new Set(modules);
  return USER_ROLE_OPTIONS.filter((role) => moduleSet.has(role.module));
}

export function isRoleEnabledForModules(role: string, modules: readonly string[] | undefined | null): boolean {
  return filterRolesByModules(modules).some((option) => option.value === role);
}
