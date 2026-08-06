import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasPermission, requireRole } from "@/lib/crm/rbac";

function makeSession(role: string, permissions?: string[]) {
  return { user: { id: "u1", role, permissions } };
}

describe("hasPermission", () => {
  it("admin and master-admin always have every permission", () => {
    expect(hasPermission(makeSession("admin"), "lead.delete")).toBe(true);
    expect(hasPermission(makeSession("master-admin"), "opportunity.close")).toBe(true);
  });

  it("read/view permissions are always allowed regardless of role", () => {
    expect(hasPermission(makeSession("sales"), "lead.read")).toBe(true);
    expect(hasPermission(makeSession("sales"), "opportunity.read")).toBe(true);
  });

  it("a non-admin without the permission and without ENFORCE_RBAC=false is denied a write permission", () => {
    const original = process.env.ENFORCE_RBAC;
    delete process.env.ENFORCE_RBAC;
    expect(hasPermission(makeSession("sales"), "lead.delete")).toBe(false);
    if (original !== undefined) process.env.ENFORCE_RBAC = original;
  });

  it("a user with an explicit per-user permission override in User.permissions[] is granted it", () => {
    const session = makeSession("sales", ["lead.delete"]);
    expect(hasPermission(session, "lead.delete")).toBe(true);
    // Doesn't grant permissions NOT explicitly listed.
    expect(hasPermission(session, "opportunity.close")).toBe(false);
  });

  it("ENFORCE_RBAC=false still allows a write with no override (escape hatch unchanged)", () => {
    const original = process.env.ENFORCE_RBAC;
    process.env.ENFORCE_RBAC = "false";
    expect(hasPermission(makeSession("sales"), "lead.delete")).toBe(true);
    if (original === undefined) delete process.env.ENFORCE_RBAC;
    else process.env.ENFORCE_RBAC = original;
  });
});

describe("requireRole", () => {
  afterEach(() => {
    delete process.env.ENFORCE_RBAC;
  });

  it("returns 401 when there's no session", () => {
    const res = requireRole(null, ["lead.delete"]);
    expect(res?.status).toBe(401);
  });

  it("returns null (allowed) for admin regardless of permission", () => {
    expect(requireRole(makeSession("admin"), ["lead.delete"])).toBeNull();
  });

  it("returns null (allowed) for a read-only permission set even without admin", () => {
    expect(requireRole(makeSession("sales"), ["lead.read"])).toBeNull();
  });

  it("returns 403 for a non-admin write permission with no override", () => {
    const res = requireRole(makeSession("sales"), ["lead.delete"]);
    expect(res?.status).toBe(403);
  });

  it("returns null when the user's per-user permission override covers one of the allowed (OR'd) permissions", () => {
    const session = makeSession("sales", ["lead.delete"]);
    expect(requireRole(session, ["lead.delete", "lead.update"])).toBeNull();
  });

  it("still returns 403 when the override doesn't cover any of the allowed permissions", () => {
    const session = makeSession("sales", ["opportunity.close"]);
    const res = requireRole(session, ["lead.delete"]);
    expect(res?.status).toBe(403);
  });
});
