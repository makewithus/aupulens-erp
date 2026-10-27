import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/aupulens_test_crm_children";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { GET as getLeadActivities } from "@/app/api/crm/leads/[id]/activities/route";
import { GET as getAccountActivities } from "@/app/api/crm/accounts/[id]/activities/route";
import { GET as getAccountCases } from "@/app/api/crm/accounts/[id]/cases/route";
import { GET as getAccountContacts } from "@/app/api/crm/accounts/[id]/contacts/route";
import { GET as getAccountTasks } from "@/app/api/crm/accounts/[id]/tasks/route";
import CrmLead from "@/models/crm/Lead";
import CrmAccount from "@/models/crm/Account";
import CrmActivity from "@/models/crm/Activity";

const tenantId = "test-crm-children";
const userId = new mongoose.Types.ObjectId().toString();

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockImplementation(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect("mongodb://127.0.0.1:27017/aupulens_test_crm_children");
    }
  }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "60d5ec49f1b2c8b1f8e4e1a1", tenantId: "test-crm-children", role: "admin" },
  }),
}));

describe("AUP-013: CRM Child Collections 404 on Missing Parent", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI!);
    }
    await Promise.all([CrmLead.init(), CrmAccount.init(), CrmActivity.init()]);
  });

  afterAll(async () => {
    await CrmLead.deleteMany({ tenantId });
    await CrmAccount.deleteMany({ tenantId });
    await CrmActivity.deleteMany({ tenantId });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it("returns HTTP 400 for malformed parent IDs", async () => {
    const req = new NextRequest("http://localhost/api/test");
    const badParams = Promise.resolve({ id: "invalid-id" });

    const res = await getLeadActivities(req, { params: badParams });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid identifier format");
  });

  it("returns HTTP 404 when parent lead does not exist", async () => {
    const req = new NextRequest("http://localhost/api/test");
    const missingId = new mongoose.Types.ObjectId().toString();
    const missingParams = Promise.resolve({ id: missingId });

    const res = await getLeadActivities(req, { params: missingParams });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe("Lead not found");
  });

  it("returns HTTP 404 when parent account does not exist across all child sub-resources", async () => {
    const req = new NextRequest("http://localhost/api/test");
    const missingId = new mongoose.Types.ObjectId().toString();
    const missingParams = Promise.resolve({ id: missingId });

    const resActivities = await getAccountActivities(req, { params: missingParams });
    expect(resActivities.status).toBe(404);
    expect((await resActivities.json()).message).toBe("Account not found");

    const resCases = await getAccountCases(req, { params: missingParams });
    expect(resCases.status).toBe(404);
    expect((await resCases.json()).message).toBe("Account not found");

    const resContacts = await getAccountContacts(req, { params: missingParams });
    expect(resContacts.status).toBe(404);
    expect((await resContacts.json()).message).toBe("Account not found");

    const resTasks = await getAccountTasks(req, { params: missingParams });
    expect(resTasks.status).toBe(404);
    expect((await resTasks.json()).message).toBe("Account not found");
  });

  it("returns HTTP 200 with data array when parent exists", async () => {
    const account = await CrmAccount.create({
      tenantId,
      company_name: "Test Corp",
      createdBy: userId,
    });

    const req = new NextRequest("http://localhost/api/test");
    const validParams = Promise.resolve({ id: String(account._id) });

    const res = await getAccountActivities(req, { params: validParams });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });
});
