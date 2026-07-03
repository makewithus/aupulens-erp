import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_bank_accounts";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import BankAccount from "@/models/BankAccount";
import Account from "@/models/Account";
import AccountType from "@/models/AccountType";
import "@/models/User";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/bank-accounts";

let GET: typeof import("@/app/api/finance/accounting/bank-accounts/route").GET;
let POST: typeof import("@/app/api/finance/accounting/bank-accounts/route").POST;

describe("bank-accounts CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await BankAccount.init();
    await Account.init();
    await AccountType.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/bank-accounts/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await BankAccount.deleteMany({});
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
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ accountName: "X", currency: "INR" }) }));
    expect(res.status).toBe(401);
  });

  it("POST requires Chart of Accounts to be seeded first (400 when 'Bank' AccountType is missing)", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ accountName: "HDFC Current", currency: "INR" }) }));
    expect(res.status).toBe(400);
  });

  it("POST creates a tenant-scoped bank account + linked GL account; GET only returns that tenant's accounts", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    await AccountType.create({ tenantId: "route-t1", name: "Bank", segment: "asset", createdBy: new mongoose.Types.ObjectId() });

    const postRes = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ accountName: "HDFC Current", currency: "INR" }) }),
    );
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.data.tenantId).toBe("route-t1");

    const glAccount = await Account.findOne({ tenantId: "route-t1", accountName: "HDFC Current" });
    expect(glAccount).not.toBeNull();

    await BankAccount.create({
      tenantId: "route-t2",
      accountType: "bank",
      accountName: "Other Tenant Account",
      currency: "USD",
      glAccountId: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
    });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].accountName).toBe("HDFC Current");
  });
});
