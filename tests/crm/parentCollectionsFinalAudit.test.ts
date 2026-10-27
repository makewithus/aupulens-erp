import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "507f1f77bcf86cd799439011", role: "admin", tenantId: "parent-a" } }) }));
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
import Account from "@/models/crm/Account";
import Lead from "@/models/crm/Lead";
import Model0 from "@/models/crm/Activity";
import { GET as get0 } from "@/app/api/crm/accounts/[id]/activities/route";
import Model1 from "@/models/crm/Case";
import { GET as get1 } from "@/app/api/crm/accounts/[id]/cases/route";
import Model2 from "@/models/crm/Contact";
import { GET as get2 } from "@/app/api/crm/accounts/[id]/contacts/route";
import Model3 from "@/models/crm/Contract";
import { GET as get3 } from "@/app/api/crm/accounts/[id]/contracts/route";
import Model4 from "@/models/crm/Opportunity";
import { GET as get4 } from "@/app/api/crm/accounts/[id]/opportunities/route";
import Model5 from "@/models/crm/Quote";
import { GET as get5 } from "@/app/api/crm/accounts/[id]/quotes/route";
import Model6 from "@/models/crm/Task";
import { GET as get6 } from "@/app/api/crm/accounts/[id]/tasks/route";
import { GET as getLead } from "@/app/api/crm/leads/[id]/activities/route";
const routes = [
  ["/api/crm/accounts/[id]/activities", get0, Model0, "linked_account_id", Account],
  ["/api/crm/accounts/[id]/cases", get1, Model1, "account_id", Account],
  ["/api/crm/accounts/[id]/contacts", get2, Model2, "account_id", Account],
  ["/api/crm/accounts/[id]/contracts", get3, Model3, "account_id", Account],
  ["/api/crm/accounts/[id]/opportunities", get4, Model4, "account_id", Account],
  ["/api/crm/accounts/[id]/quotes", get5, Model5, "account_id", Account],
  ["/api/crm/accounts/[id]/tasks", get6, Model6, "linked_account_id", Account],
  ["/api/crm/leads/[id]/activities", getLead, Model0, "linked_lead_id", Lead]
] as const;
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 }); });
afterAll(async () => { if (mongoose.connection.name.startsWith("aupulens_test_")) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
for (const [path, get, Child, field, Parent] of routes) {
  describe(`GET ${path} persisted parent and child isolation`, () => {
    const call = (id: any) => get(new NextRequest(`http://localhost${path}`), { params: Promise.resolve({ id }) });
    it.each([undefined, "invalid-id", { $ne: null }])("rejects invalid parent %j with a sanitized 400", async (id) => {
      const response = await call(id);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid identifier format" });
    });
    it("returns 404 for a nonexistent parent", async () => { expect((await call(String(new mongoose.Types.ObjectId()))).status).toBe(404); });
    it("returns 404 for another tenant's persisted parent", async () => {
      const id = new mongoose.Types.ObjectId();
      await Parent.collection.insertOne({ _id: id, tenantId: "parent-b", company_name: "Foreign", createdBy: new mongoose.Types.ObjectId() } as any);
      expect((await call(String(id))).status).toBe(404);
    });
    it("returns 200 and an empty collection for an existing current-tenant parent", async () => {
      const id = new mongoose.Types.ObjectId();
      await Parent.collection.insertOne({ _id: id, tenantId: "parent-a", company_name: "Own", createdBy: new mongoose.Types.ObjectId() } as any);
      const response = await call(String(id));
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual([]);
    });
    it("returns only current-tenant children for an existing current-tenant parent", async () => {
      const id = new mongoose.Types.ObjectId(), ownChild = new mongoose.Types.ObjectId(), foreignChild = new mongoose.Types.ObjectId();
      await Parent.collection.insertOne({ _id: id, tenantId: "parent-a", company_name: "Own", createdBy: new mongoose.Types.ObjectId() } as any);
      await Child.collection.insertMany([
        { _id: ownChild, tenantId: "parent-a", [field]: id, subject: "Own fixture" },
        { _id: foreignChild, tenantId: "parent-b", [field]: id, subject: "Foreign fixture" },
      ] as any);
      const response = await call(String(id));
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.map((item: any) => item._id)).toEqual([String(ownChild)]);
      expect(data.every((item: any) => item.tenantId === "parent-a")).toBe(true);
    });
  });
}
