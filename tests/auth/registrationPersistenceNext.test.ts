import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
import User from "@/models/auth/User";
import Organization from "@/models/admin/Organization";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";
import Accountant from "@/models/finance/Accountant";
import * as featureSeeder from "@/lib/accounting/coa-feature-seeder";
import { POST } from "@/app/api/auth/register/route";
const request = (slug: string, extra = {}) => new NextRequest("http://localhost/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Synthetic Owner", email: `owner@${slug}.example.invalid`, phone: "9999999999", password: "test-only-password", subdomain: slug, ...extra }) });
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName || !mongoose.connection.name.startsWith("aupulens_test_")) throw new Error("Disposable replica set required");
  await Promise.all([User, Organization, SubscriptionEvent, Account, AccountType, Accountant].map(m => m.init()));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
describe("AUP-001/002: actual provisioning transaction and immutable identity", () => {
  it("fails closed in disabled/default mode without records", async () => {
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", undefined);
    expect((await POST(request("disabled-next"))).status).toBe(403);
    expect(await Organization.countDocuments({ subdomain: "disabled-next" })).toBe(0);
  });
  it("creates an empty isolated organization with hashed credentials and canonical COA", async () => {
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", "true");
    const response = await POST(request("new-next"));
    expect(response.status).toBe(201);
    const body = await response.json();
    const owner = await User.findOne({ tenantId: "new-next" }).select("+tempTokenHash +tempToken").lean();
    expect(owner?.tempToken).toBeUndefined(); expect(owner?.tempTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.user).not.toHaveProperty("password");
    expect(String((await Organization.findOne({ subdomain: "new-next" }))?.ownerUserId)).toBe(String(owner?._id));
    expect(await SubscriptionEvent.countDocuments({ tenantId: "new-next" })).toBe(1);
    expect(await Account.countDocuments({ tenantId: "new-next" })).toBeGreaterThan(50);
    expect(await Account.countDocuments({ tenantId: "new-next", internal_group: "off_balance" })).toBe(0);
    const names = ["salesinvoices", "saleorders", "customers", "journalentries"];
    for (const name of names) expect(await mongoose.connection.collection(name).countDocuments({ tenantId: "new-next" })).toBe(0);
  });
  it("does not let a second public user replace ownership", async () => {
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", "true");
    const before = await Organization.findOne({ subdomain: "new-next" }).lean();
    expect((await POST(request("new-next", { email: "attacker@example.invalid" }))).status).toBe(409);
    expect(String((await Organization.findOne({ subdomain: "new-next" }))?.ownerUserId)).toBe(String(before?.ownerUserId));
    expect(await User.countDocuments({ tenantId: "new-next" })).toBe(1);
  });
  it("rolls back organization, user, event and partial chart when a later seeding step fails", async () => {
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", "true");
    vi.spyOn(featureSeeder, "seedNewChartOfAccounts").mockRejectedValueOnce(new Error("Injected after base COA writes"));
    const response = await POST(request("rollback-next"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Injected");
    expect(await Organization.countDocuments({ subdomain: "rollback-next" })).toBe(0);
    for (const Model of [User, Account, AccountType, SubscriptionEvent]) expect(await Model.countDocuments({ tenantId: "rollback-next" })).toBe(0);
  });
  it("allows only one concurrent owner for the same new tenant", async () => {
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", "true");
    const responses = await Promise.all([POST(request("race-next")), POST(request("race-next", { email: "second@example.invalid" }))]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await Organization.countDocuments({ subdomain: "race-next" })).toBe(1);
    expect(await User.countDocuments({ tenantId: "race-next" })).toBe(1);
    expect(await SubscriptionEvent.countDocuments({ tenantId: "race-next" })).toBe(1);
  });
  it("prevents tenant movement via both document save and Mongoose query updates", async () => {
    const user = await User.findOne({ tenantId: "new-next" });
    user!.tenantId = "foreign-next"; await user!.save();
    await User.updateOne({ _id: user!._id }, { $set: { tenantId: "foreign-next", name: "Valid edit" } });
    expect((await User.findById(user!._id))?.tenantId).toBe("new-next");
    expect((await User.findById(user!._id))?.name).toBe("Valid edit");
  });
});
