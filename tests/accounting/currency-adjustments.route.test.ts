import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_currency_adjustments";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import CurrencyAdjustment from "@/models/finance/CurrencyAdjustment";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/currency-adjustments";

let GET: typeof import("@/app/api/finance/accounting/currency-adjustments/route").GET;
let POST: typeof import("@/app/api/finance/accounting/currency-adjustments/route").POST;

describe("currency-adjustments CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await CurrencyAdjustment.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/currency-adjustments/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await CurrencyAdjustment.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  const validBody = () => ({
    currency: "USD",
    baseCurrency: "INR",
    dateOfAdjustment: "2026-03-31",
    exchangeRate: 83.5,
    notes: "Quarter-end revaluation",
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(validBody()) }));
    expect(res.status).toBe(401);
  });

  it("POST creates a tenant-scoped adjustment; GET only returns that tenant's adjustments", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const postRes = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(validBody()) }));
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.data.tenantId).toBe("route-t1");

    await CurrencyAdjustment.create({
      tenantId: "route-t2",
      currency: "USD",
      baseCurrency: "INR",
      dateOfAdjustment: new Date("2026-03-31"),
      exchangeRate: 83.5,
      notes: "Other tenant",
      createdBy: new mongoose.Types.ObjectId(),
    });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].notes).toBe("Quarter-end revaluation");
  });

  it("POST rejects a missing notes field with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    const { notes, ...rest } = validBody();
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(rest) }));
    expect(res.status).toBe(400);
  });
});
