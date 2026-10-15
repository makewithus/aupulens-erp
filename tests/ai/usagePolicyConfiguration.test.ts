import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";
const m = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), save: vi.fn() }));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/platform/entitlements/resolve", () => ({ resolveEntitlements: vi.fn() }));
import Organization from "@/models/admin/Organization";
import { PATCH } from "@/app/api/admin/org-settings/route";
import { isValidAiWindowPolicy, quotaWindow } from "@/lib/ai/usagePolicy";
const policy = { startsAt: "2026-10-15T00:00:00Z", session: { minutes: 60, limit: 10 }, weekly: { limit: null } };
const request = (usagePolicy: unknown) => new NextRequest("http://localhost/api/admin/org-settings", { method: "PATCH", body: JSON.stringify({ settings: { ai: { usagePolicy } } }), headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.restoreAllMocks(); m.auth.mockReset(); m.save.mockReset(); m.find.mockReset();
  m.auth.mockResolvedValue({ user: { id: "test", role: "admin", tenantId: "test-only" } });
  m.find.mockResolvedValue({ settings: { ai: {} }, save: m.save });
  vi.spyOn(Organization, "findOne").mockImplementation(m.find);
});
describe("explicit policy settings", () => {
  it("does not cast an omitted limit to unlimited in an organization document", () => {
    const org = new Organization({ name: "test", subdomain: "test", ownerUserId: new mongoose.Types.ObjectId(), settings: { ai: { usagePolicy: { startsAt: policy.startsAt, session: { minutes: 60 } } } } });
    expect(org.settings.ai?.usagePolicy?.session?.limit).toBeUndefined();
    expect(quotaWindow(org.settings.ai?.usagePolicy, "session", new Date("2026-10-15T00:01Z"))).toBe("unavailable");
  });
  it("validates missing, malformed, finite, zero and explicit unlimited limits", () => {
    expect(isValidAiWindowPolicy(policy)).toBe(true);
    expect(isValidAiWindowPolicy({ ...policy, session: { minutes: 60, limit: 0 } })).toBe(true);
    for (const limit of [undefined, -1, NaN, Infinity, "10", 1.5]) expect(isValidAiWindowPolicy({ ...policy, weekly: { limit } })).toBe(false);
    expect(isValidAiWindowPolicy({ ...policy, startsAt: "2026-10-15T00:00:00" })).toBe(false);
  });
  it("rejects invalid policy changes before saving", async () => {
    expect((await PATCH(request({ ...policy, session: { minutes: 60 } }))).status).toBe(400);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("supports the existing authenticated settings API and explicit removal", async () => {
    expect((await PATCH(request(policy))).status).toBe(200);
    expect(m.save).toHaveBeenCalledTimes(1);
    expect((await PATCH(request(null))).status).toBe(200);
    expect(m.find.mock.results[1]).toBeDefined();
  });
  it("requires an authenticated admin without accepting a tenant override", async () => {
    m.auth.mockResolvedValue(null); expect((await PATCH(request(policy))).status).toBe(401);
    m.auth.mockResolvedValue({ user: { role: "hr", tenantId: "test-only" } });
    expect((await PATCH(request(policy))).status).toBe(403);
    expect(m.save).not.toHaveBeenCalled();
  });
});
