import { isRoleEnabledForModules } from "@/lib/admin/roleModules";

export interface UserDepartment {
  _id?: string;
  name: string;
  code?: string;
  isActive?: boolean;
}

type DepartmentModuleInput = Pick<UserDepartment, "name" | "code" | "isActive">;

const DEPARTMENT_MODULES: Record<string, string> = {
  admin: "admin", administration: "admin",
  fin: "finance", finance: "finance",
  hr: "hr", "human resources": "hr",
  sal: "sales", sales: "sales",
  inv: "inventory", inventory: "inventory",
  mfg: "manufacturing", manufacturing: "manufacturing",
  proj: "project", project: "project", projects: "project",
};

export function getDepartmentModule(department: DepartmentModuleInput): string | undefined {
  const normalize = (value?: string) => value?.trim().toLowerCase() ?? "";
  return DEPARTMENT_MODULES[normalize(department.code)] ?? DEPARTMENT_MODULES[normalize(department.name)];
}

export function isDepartmentEnabledForModules(
  department: DepartmentModuleInput,
  modules: readonly string[] | null | undefined,
): boolean {
  if (department.isActive === false || !modules) return false;
  const moduleKey = getDepartmentModule(department);
  // Custom HR departments have no module entitlement; preserve those choices.
  return moduleKey ? isRoleEnabledForModules(moduleKey, modules) : true;
}

export function filterDepartmentsByModules<T extends UserDepartment>(
  departments: readonly T[],
  modules: readonly string[] | null | undefined,
): T[] {
  return departments.filter((department) => isDepartmentEnabledForModules(department, modules));
}
