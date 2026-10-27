import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
import User from "@/models/auth/User";
import { POST } from "@/app/api/auth/password-reset/confirm/route";
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 }); });
afterAll(async () => { if (mongoose.connection.name.startsWith("aupulens_test_")) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
async function fixture(expiry = Date.now() + 60_000) {
  const id = new mongoose.Types.ObjectId(), token = crypto.randomBytes(32).toString("hex");
  const email = `${id}@example.invalid`;
  await User.collection.insertOne({ _id: id, tenantId: "reset-a", email, password: "unchanged-fixture", passwordResetTokenHash: crypto.createHash("sha256").update(token).digest("hex"), passwordResetTokenExpiry: new Date(expiry) });
  return { id, email, token };
}
const reset = (email: string, token: any, tenantId = "reset-a") => POST(new NextRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ tenantId, email, token, newPassword: "new-audit-password" }) }));
describe("Final audit: persisted password reset lifecycle", () => {
  it("permits exactly one concurrent reset and stores the new bcrypt password", async () => {
    const { id, email, token } = await fixture();
    const responses = await Promise.all([reset(email, token), reset(email, token)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
    expect((await reset(email, token)).status).toBe(400);
    const user = await User.collection.findOne({ _id: id });
    expect(await bcrypt.compare("new-audit-password", user!.password)).toBe(true);
    expect(user).not.toHaveProperty("passwordResetTokenHash");
    expect(user).not.toHaveProperty("passwordResetTokenExpiry");
  });
  it("rejects expired tokens without changing the password", async () => {
    const { id, email, token } = await fixture(Date.now() - 1);
    expect((await reset(email, token)).status).toBe(400);
    expect((await User.collection.findOne({ _id: id }))?.password).toBe("unchanged-fixture");
  });
  it("rejects a foreign tenant and wrong token while keeping the valid token usable", async () => {
    const { email, token } = await fixture();
    expect((await reset(email, token, "reset-b")).status).toBe(400);
    expect((await reset(email, "invalid")).status).toBe(400);
    expect((await reset(email, token)).status).toBe(200);
  });
});
