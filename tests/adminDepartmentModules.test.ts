import { describe, expect, it } from "vitest";
import { filterDepartmentsByModules, getDepartmentModule, isDepartmentEnabledForModules } from "@/lib/admin/departmentModules";

const departments = [
  { name: "Administration", code: "ADMIN" },
  { name: "Finance", code: "FIN" },
  { name: "Human Resources", code: "HR" },
  { name: "Inventory", code: "INV" },
  { name: "Manufacturing", code: "MFG" },
  { name: "Projects", code: "PROJ" },
  { name: "Sales", code: "SALES" },
];

describe("user department entitlements", () => {
  it("shows only assigned module departments for a starter organization", () => {
    expect(filterDepartmentsByModules(departments, ["admin", "finance", "sales"]).map(d => d.name))
      .toEqual(["Administration", "Finance", "Sales"]);
  });

  it("honors module overrides rather than a hardcoded plan list", () => {
    expect(filterDepartmentsByModules(departments, ["admin", "project", "manufacturing"]).map(d => d.name))
      .toEqual(["Administration", "Manufacturing", "Projects"]);
  });

  it("supports every default department when all modules are approved", () => {
    expect(filterDepartmentsByModules(departments, ["admin", "finance", "hr", "inventory", "manufacturing", "project", "sales"]))
      .toEqual(departments);
  });

  it("recognizes renamed departments by code and legacy departments by name", () => {
    expect(getDepartmentModule({ name: "Accounts", code: " fin " })).toBe("finance");
    expect(isDepartmentEnabledForModules({ name: "Human Resources" }, ["admin"])).toBe(false);
    expect(isDepartmentEnabledForModules({ name: "Projects" }, ["project"])).toBe(true);
  });

  it("hides inactive departments and fails closed while entitlements are unavailable", () => {
    expect(filterDepartmentsByModules(departments, null)).toEqual([]);
    expect(isDepartmentEnabledForModules({ name: "Finance", isActive: false }, ["finance"])).toBe(false);
  });

  it("preserves custom HR departments that do not represent modules", () => {
    expect(isDepartmentEnabledForModules({ name: "Customer Success", code: "CS" }, ["admin"])).toBe(true);
  });
});
