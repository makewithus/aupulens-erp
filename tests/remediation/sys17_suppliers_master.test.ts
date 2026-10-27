import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_remediation_sys17";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Customer from "@/models/sales/Customer";
import { invalidateServerCache } from "@/lib/api/serverCache";

const TENANT = "kk-metals-sys17";

function mockSession(tenantId: string, role = "admin") {
  return {
    user: {
      id: new mongoose.Types.ObjectId().toString(),
      email: "rajesh@gmail.com",
      name: "Rajesh",
      role,
      tenantId,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

let suppliersGET: typeof import("@/app/api/purchasing/suppliers/route").GET;
let suppliersPOST: typeof import("@/app/api/purchasing/suppliers/route").POST;
let customersGET: typeof import("@/app/api/sales/customers/route").GET;

describe("SYS-17: Dedicated Supplier Master & Customer Isolation", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Customer.init();

    ({ GET: suppliersGET, POST: suppliersPOST } = await import("@/app/api/purchasing/suppliers/route"));
    ({ GET: customersGET } = await import("@/app/api/sales/customers/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    invalidateServerCache();
    await Customer.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("creates a supplier independently without appearing in customers list or customer counts", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);

    // 1. Create a pure customer
    await Customer.create({
      tenantId: TENANT,
      header: { name: "True Customer Ltd" },
      isCustomer: true,
      isSupplier: false,
      createdBy: new mongoose.Types.ObjectId(session.user.id),
    });

    // 2. Create a supplier via /api/purchasing/suppliers
    const supplierPayload = {
      name: "Steel Supplier Corp",
      email: "orders@steelsupplier.com",
      phone: "+91 9876543210",
      taxId: "27AABCS1429B1Z",
      city: "Mumbai",
      state: "Maharashtra",
    };

    const postReq = new NextRequest("http://localhost/api/purchasing/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(supplierPayload),
    });

    const postRes = await suppliersPOST(postReq);
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.supplier.header.name).toBe("Steel Supplier Corp");
    expect(postData.supplier.isSupplier).toBe(true);
    expect(postData.supplier.isCustomer).toBe(false);

    // 3. Fetch /api/purchasing/suppliers: must contain "Steel Supplier Corp" and NOT "True Customer Ltd"
    const supGetReq = new NextRequest("http://localhost/api/purchasing/suppliers");
    const supGetRes = await suppliersGET(supGetReq);
    expect(supGetRes.status).toBe(200);
    const supData = await supGetRes.json();
    const supNames = supData.items.map((s: any) => s.header?.name || s.name);
    expect(supNames).toContain("Steel Supplier Corp");
    expect(supNames).not.toContain("True Customer Ltd");

    // 4. Fetch /api/sales/customers: must contain "True Customer Ltd" and NOT "Steel Supplier Corp"
    const custGetReq = new NextRequest("http://localhost/api/sales/customers");
    const custGetRes = await customersGET(custGetReq);
    expect(custGetRes.status).toBe(200);
    const custData = await custGetRes.json();
    const custNames = custData.items.map((c: any) => c.header?.name);
    expect(custNames).toContain("True Customer Ltd");
    expect(custNames).not.toContain("Steel Supplier Corp");
    expect(custData.total).toBe(1); // exactly 1 customer, supplier does not increment customer count!
  });

  it("supports dual-role business partners acting legitimately as both customer and supplier", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);

    // Create a dual-role entity
    await Customer.create({
      tenantId: TENANT,
      header: { name: "Dual Role Partner Co" },
      isCustomer: true,
      isSupplier: true,
      createdBy: new mongoose.Types.ObjectId(session.user.id),
    });

    // Check suppliers list: must appear
    const supRes = await suppliersGET(new NextRequest("http://localhost/api/purchasing/suppliers"));
    const supData = await supRes.json();
    expect(supData.items.some((s: any) => s.header?.name === "Dual Role Partner Co")).toBe(true);

    // Check customers list: must appear
    const custRes = await customersGET(new NextRequest("http://localhost/api/sales/customers"));
    const custData = await custRes.json();
    expect(custData.items.some((c: any) => c.header?.name === "Dual Role Partner Co")).toBe(true);
  });
});
