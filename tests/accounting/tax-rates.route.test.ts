import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_tax_rates";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import TaxRate from "@/models/TaxRate";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/tax-rates";

let GET: typeof import("@/app/api/finance/accounting/tax-rates/route").GET;
let POST: typeof import("@/app/api/finance/accounting/tax-rates/route").POST;

describe("tax-rates CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await TaxRate.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/tax-rates/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await TaxRate.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "GST 18%", ratePercent: 18 }) }));
    expect(res.status).toBe(401);
  });

  it("POST creates a tenant-scoped rate; GET only returns that tenant's rates", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const postRes = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "GST 18%", ratePercent: 18 }) }));
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.data.tenantId).toBe("route-t1");

    await TaxRate.create({ tenantId: "route-t2", name: "GST 18%", ratePercent: 18, createdBy: new mongoose.Types.ObjectId() });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].name).toBe("GST 18%");
  });

  it("POST rejects a duplicate type+name for the same tenant with 409", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "Dup Rate", ratePercent: 5 }) }));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "Dup Rate", ratePercent: 5 }) }));
    expect(res.status).toBe(409);
  });
});
