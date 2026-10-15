import { describe, expect, it } from "vitest";
import User from "@/models/auth/User";
import { USER_ROLE_OPTIONS, filterRolesByModules, getUserRoleOption, isRoleEnabledForModules } from "@/lib/admin/roleModules";

const expected = {
  admin: ["Admin"],
  hr: ["HR Manager", "HR Staff"],
  inventory: ["Inventory Manager", "Inventory Staff"],
  finance: ["Finance Manager", "Accountant"],
  sales: ["Sales Manager", "Sales Executive"],
  manufacturing: ["Production Manager", "Production Staff"],
  crm: ["CRM Manager", "CRM Executive"],
  project: ["Project Manager", "Project Member"],
};

describe("organization role catalog", () => {
  for (const [moduleKey, labels] of Object.entries(expected)) {
    it(`exposes exactly the requested ${moduleKey} roles when granted`, () => {
      expect(filterRolesByModules([moduleKey]).map(role => role.label)).toEqual(labels);
      for (const role of USER_ROLE_OPTIONS.filter(role => role.module === moduleKey)) {
        expect(isRoleEnabledForModules(role.value, [moduleKey])).toBe(true);
        expect(isRoleEnabledForModules(role.value, Object.keys(expected).filter(key => key !== moduleKey))).toBe(false);
        const user = new User({ tenantId: "test", name: "Test", email: "test@example.test", phone: "123", password: "test-password", role: role.module, userRole: role.value });
        expect(user.validateSync()).toBeUndefined();
      }
    });
  }

  it("shows no roles before entitlements load or when no modules are granted", () => {
    expect(filterRolesByModules(undefined)).toEqual([]);
    expect(filterRolesByModules(null)).toEqual([]);
    expect(filterRolesByModules([])).toEqual([]);
    expect(isRoleEnabledForModules("admin", [])).toBe(false);
  });

  it("adds newly granted roles automatically and removes revoked module roles", () => {
    const before = filterRolesByModules(["admin", "finance"]);
    const upgraded = filterRolesByModules(["admin", "finance", "crm"]);
    expect(upgraded.filter(role => !before.includes(role)).map(role => role.label)).toEqual(["CRM Manager", "CRM Executive"]);
    expect(filterRolesByModules(["admin"]).map(role => role.label)).toEqual(["Admin"]);
  });

  it("resolves legacy module roles without changing their access module", () => {
    for (const moduleKey of Object.keys(expected)) {
      expect(getUserRoleOption(moduleKey)?.module).toBe(moduleKey);
    }
    expect(isRoleEnabledForModules("master-admin", Object.keys(expected))).toBe(false);
    expect(isRoleEnabledForModules("unknown", Object.keys(expected))).toBe(false);
  });
});
