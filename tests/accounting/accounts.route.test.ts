import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_accounts";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/accounts";

let GET: typeof import("@/app/api/finance/accounting/accounts/route").GET;
let POST: typeof import("@/app/api/finance/accounting/accounts/route").POST;

describe("accounts CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Account.init();
    await AccountType.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/accounts/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Account.deleteMany({});
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
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ accountName: "X" }) }));
    expect(res.status).toBe(401);
  });

  it("POST creates a tenant-scoped account; GET only returns that tenant's accounts", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const type = await AccountType.create({ tenantId: "route-t1", name: "Bank", segment: "asset", createdBy: new mongoose.Types.ObjectId() });

    const postRes = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ accountName: "HDFC Current", accountType: type._id.toString() }) }),
    );
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.account.tenantId).toBe("route-t1");

    await Account.create({
      tenantId: "route-t2",
      accountName: "Other Tenant Account",
      accountType: type._id,
      createdBy: new mongoose.Types.ObjectId(),
    });

    const getRes = await GET(makeRequest(`${URL}?view=active`));
    const getBody = await getRes.json();
    const names = getBody.accounts.map((a: any) => a.accountName);
    expect(names).toContain("HDFC Current");
    expect(names).not.toContain("Other Tenant Account");
  });

  it("POST rejects missing required fields with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });
});
