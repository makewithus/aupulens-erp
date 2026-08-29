import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_accountants";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Accountant from "@/models/finance/Accountant";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/accountants";

let GET: typeof import("@/app/api/finance/accounting/accountants/route").GET;

describe("accountants route (global, non-tenant-scoped directory)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Accountant.init();
    ({ GET } = await import("@/app/api/finance/accounting/accountants/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    vi.mocked(auth).mockReset();
  });

  it("returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("auto-seeds and lists the shared accountant directory, unfiltered by tenant", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.accountants)).toBe(true);
    expect(body.accountants.length).toBeGreaterThan(0);
  });

  it("filters by country and state query params", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    await Accountant.create({
      name: "Filter Target",
      firmName: "Filter Firm",
      country: "Testland",
      state: "TestState",
      phone: "1234567890",
      email: "filter@example.com",
    });

    const res = await GET(makeRequest(`${URL}?country=Testland&state=TestState`));
    const body = await res.json();
    expect(body.accountants).toHaveLength(1);
    expect(body.accountants[0].name).toBe("Filter Target");
  });
});
