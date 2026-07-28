import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_legacy_accounts";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Account from "@/models/Account";
import AccountType from "@/models/AccountType";
import { mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/accounting/accounts";

let GET: typeof import("@/app/api/accounting/accounts/route").GET;

// Issue #8 regression: the Payments "Deposit To" / Journal Entries bank
// picker (?type=bank) was showing the boilerplate "Bank Current Account"
// placeholder auto-created by seedChartOfAccounts() for every tenant, even
// when that tenant never added a real bank account. Fixed by flagging
// seeder-created rows (isSystemSeeded / isLocked) and excluding them from
// this filter.
describe("legacy accounts route - ?type=bank filter (Issue #8)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Account.init();
    await AccountType.init();
    ({ GET } = await import("@/app/api/accounting/accounts/route"));
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

  it("excludes the isSystemSeeded placeholder bank/cash account", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const userId = new mongoose.Types.ObjectId();

    await Account.create({
      tenantId: "route-t1",
      code: "1120",
      name: "Bank Current Account",
      account_type: "asset_cash",
      internal_group: "asset",
      isSystemSeeded: true,
      createdBy: userId,
    });

    const res = await GET(new NextRequest(`${URL}?type=bank`));
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });

  it("excludes the isLocked default 'Undeposited Funds' / 'Petty Cash' catalog rows", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t2"));
    const userId = new mongoose.Types.ObjectId();
    const bankType = await AccountType.create({ tenantId: "route-t2", name: "Cash", segment: "Cash and cash equivalents", createdBy: userId });

    await Account.create({
      tenantId: "route-t2",
      accountName: "Undeposited Funds",
      accountType: bankType._id,
      isLocked: true,
      createdBy: userId,
    });

    const res = await GET(new NextRequest(`${URL}?type=bank`));
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });

  it("still returns a real, user-created bank account", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    const userId = new mongoose.Types.ObjectId();
    const bankType = await AccountType.create({ tenantId: "route-t3", name: "Bank", segment: "Cash and cash equivalents", createdBy: userId });

    await Account.create({
      tenantId: "route-t3",
      accountName: "HDFC Bank - Current Account",
      accountType: bankType._id,
      createdBy: userId,
    });
    // The seeded placeholder should still not leak in alongside the real one.
    await Account.create({
      tenantId: "route-t3",
      code: "1120",
      name: "Bank Current Account",
      account_type: "asset_cash",
      internal_group: "asset",
      isSystemSeeded: true,
      createdBy: userId,
    });

    const res = await GET(new NextRequest(`${URL}?type=bank`));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].accountName).toBe("HDFC Bank - Current Account");
  });

  it("does not filter by bank/cash type when ?type is omitted", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t4"));
    const userId = new mongoose.Types.ObjectId();
    await Account.create({
      tenantId: "route-t4",
      code: "5100",
      name: "Cost of Goods Sold",
      account_type: "expense_direct_cost",
      internal_group: "expense",
      isSystemSeeded: true,
      createdBy: userId,
    });

    const res = await GET(new NextRequest(URL));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});
