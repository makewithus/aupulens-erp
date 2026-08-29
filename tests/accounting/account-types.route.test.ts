import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_account_types";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import AccountType from "@/models/finance/AccountType";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/account-types";

let GET: typeof import("@/app/api/finance/accounting/account-types/route").GET;
let POST: typeof import("@/app/api/finance/accounting/account-types/route").POST;

describe("account-types CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AccountType.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/account-types/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AccountType.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "X", segment: "asset" }) }));
    expect(res.status).toBe(401);
  });

  it("POST creates a tenant-scoped account type; GET only returns that tenant's types", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const postRes = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "Custom Asset Type", segment: "asset" }) }),
    );
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.accountType.tenantId).toBe("route-t1");
    expect(postBody.accountType.isSystem).toBe(false);

    await AccountType.create({ tenantId: "route-t2", name: "Other Tenant Type", segment: "liability", createdBy: new mongoose.Types.ObjectId() });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    const names = getBody.accountTypes.map((a: any) => a.name);
    expect(names).toContain("Custom Asset Type");
    expect(names).not.toContain("Other Tenant Type");
  });

  it("POST rejects a duplicate name for the same tenant with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "Dup Type", segment: "asset" }) }));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "Dup Type", segment: "asset" }) }));
    expect(res.status).toBe(400);
  });
});
