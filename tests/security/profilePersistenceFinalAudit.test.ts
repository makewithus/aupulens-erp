import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
const m = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
import User from "@/models/auth/User";
import { GET, PATCH } from "@/app/api/profile/route";
const own = new mongoose.Types.ObjectId();
const foreign = new mongoose.Types.ObjectId();
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 });
  await User.collection.insertMany([
    { _id: own, tenantId: "profile-a", email: "shared@example.invalid", name: "Own", role: "sales", password: "fixture-hash", tempTokenHash: "fixture-onboarding-hash", passwordResetTokenHash: "fixture-reset-hash" },
    { _id: foreign, tenantId: "profile-b", email: "shared@example.invalid", name: "Foreign", role: "admin" },
  ]);
});
beforeEach(() => m.auth.mockResolvedValue({ user: { id: String(own), tenantId: "profile-a", email: "shared@example.invalid" } }));
afterAll(async () => {
  if (mongoose.connection.name.startsWith("aupulens_test_")) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
const patch = (body: any) => PATCH(new Request("http://localhost/api/profile", { method: "PATCH", body: JSON.stringify(body) }));
describe("Final audit: persisted profile isolation", () => {
  it("updates legitimate fields and leaves identity, role, audit and foreign record unchanged", async () => {
    const beforeForeign = await User.collection.findOne({ _id: foreign });
    const response = await patch({ name: "Updated", tenantId: "profile-b", _id: String(foreign), role: "admin", permissions: ["all"], status: "active", isOwner: true, createdBy: String(foreign), tempTokenHash: "attacker", passwordResetTokenHash: "attacker", "tenantId.value": "profile-b" });
    expect(response.status).toBe(200);
    const ownState = await User.collection.findOne({ _id: own });
    expect(ownState).toMatchObject({ name: "Updated", tenantId: "profile-a", role: "sales", tempTokenHash: "fixture-onboarding-hash", passwordResetTokenHash: "fixture-reset-hash" });
    expect(ownState).not.toHaveProperty("isOwner");
    expect(await User.collection.findOne({ _id: foreign })).toEqual(beforeForeign);
    const body = await response.json();
    for (const key of ["password", "tempToken", "tempTokenHash", "tempTokenExpiry", "passwordResetTokenHash", "passwordResetTokenExpiry"]) expect(body.user).not.toHaveProperty(key);
  });
  it("does not return secrets on GET", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toMatch(/fixture-hash|fixture-onboarding-hash|fixture-reset-hash/);
  });
  it("returns not found for a foreign user ID under the current tenant", async () => {
    m.auth.mockResolvedValue({ user: { id: String(foreign), tenantId: "profile-a" } });
    expect((await GET()).status).toBe(404);
    expect((await patch({ name: "Intrusion" })).status).toBe(404);
    expect((await User.collection.findOne({ _id: foreign }))?.name).toBe("Foreign");
  });
  it("denies unauthenticated reads and updates", async () => {
    m.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await patch({ name: "Intrusion" })).status).toBe(401);
  });
});
