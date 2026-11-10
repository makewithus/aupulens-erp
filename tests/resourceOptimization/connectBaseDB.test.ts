import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_basedb";
vi.mock("@/lib/email/waitlistNotification", () => ({ sendWaitlistNotificationEmail: vi.fn(async () => ({ success: true })) }));

describe("connectBaseDB — lightweight connection for a model-light public route", () => {
  beforeAll(() => { delete (globalThis as any).mongoose; });
  afterAll(async () => { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.connection.close(); });

  it("public waitlist POST works end-to-end without registering the unrelated model registry", async () => {
    const { POST } = await import("@/app/api/public/waitlist/route");
    const res = await POST(new NextRequest("http://x/api/public/waitlist", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://aupulens.com" },
      body: JSON.stringify({ companyName: "Acme Base DB", email: "base@acme.com", formType: "book_demo" }),
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);

    const Waitlist = (await import("@/models/platform/Waitlist")).default;
    expect(await Waitlist.countDocuments({ email: "base@acme.com" })).toBe(1);

    const names = mongoose.modelNames();
    expect(names).toContain("Waitlist");
    expect(names.length).toBeLessThan(10);          // the full registry is 36 models
    expect(names).not.toContain("CrmLead");
  });

  it("connectBaseDB and connectDB share ONE connection (no duplicate pool) and reuse it", async () => {
    const { connectBaseDB, default: connectDB } = await import("@/lib/db");
    const a = await connectBaseDB();
    const b = await connectDB();
    const c = await connectBaseDB();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(mongoose.connections.filter((x) => x.readyState === 1)).toHaveLength(1);
  });

  it("connectDB registers the full model registry exactly once and populate across modules works (no MissingSchemaError / OverwriteModelError)", async () => {
    const { default: connectDB } = await import("@/lib/db");
    await connectDB();
    await connectDB();
    const names = mongoose.modelNames();
    expect(names.length).toBeGreaterThan(30);
    expect(new Set(names).size).toBe(names.length);
    const CrmCase = mongoose.models.CrmCase;
    expect(CrmCase).toBeDefined();
    await expect(CrmCase.find({ tenantId: "none" }).populate("account_id").lean()).resolves.toEqual([]);
  });
});
