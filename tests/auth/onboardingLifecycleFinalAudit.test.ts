import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import crypto from "node:crypto";
import User from "@/models/auth/User";
import { consumeOnboardingToken } from "@/lib/auth/consumeOnboardingToken";
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 }); });
afterAll(async () => { if (mongoose.connection.name.startsWith("aupulens_test_")) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
async function fixture(expiry = Date.now() + 300_000, status = "active") {
  const id = new mongoose.Types.ObjectId();
  const token = `autologin_${crypto.randomBytes(24).toString("hex")}`;
  await User.collection.insertOne({ _id: id, email: `${id}@test.invalid`, tenantId: "token-a", status, tempTokenHash: crypto.createHash("sha256").update(token).digest("hex"), tempTokenExpiry: new Date(expiry) });
  return { id: String(id), token };
}
describe("Final audit: persisted onboarding credential lifecycle", () => {
  it("allows exactly one concurrent consumer and removes all stored token fields", async () => {
    const { id, token } = await fixture();
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeOnboardingToken(id, "token-a", token)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeOnboardingToken(id, "token-a", token)).toBe(false);
    const user = await User.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    for (const key of ["tempToken", "tempTokenHash", "tempTokenExpiry"]) expect(user).not.toHaveProperty(key);
  });
  it("rejects expired credentials", async () => {
    const { id, token } = await fixture(Date.now() - 1);
    expect(await consumeOnboardingToken(id, "token-a", token)).toBe(false);
  });
  it("rejects cross-tenant credentials without consuming the valid credential", async () => {
    const { id, token } = await fixture();
    expect(await consumeOnboardingToken(id, "token-b", token)).toBe(false);
    expect(await consumeOnboardingToken(id, "token-a", token)).toBe(true);
  });
  it.each([undefined, "invalid", {}, "reset_" + "a".repeat(48)])("rejects malformed or unrelated credential %j", async (token) => {
    const { id } = await fixture();
    expect(await consumeOnboardingToken(id, "token-a", token)).toBe(false);
  });
  it("rejects deactivated users", async () => {
    const { id, token } = await fixture(Date.now() + 300_000, "inactive");
    expect(await consumeOnboardingToken(id, "token-a", token)).toBe(false);
  });
});
