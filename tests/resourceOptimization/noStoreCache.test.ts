import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_nostore";
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Department from "@/models/hr/Department";
import { mockSession } from "../accounting/_helpers/routeTestUtils";

const A = "ro-org-a";
const B = "ro-org-b";
const NO_STORE = "private, no-store";

const ENDPOINTS: Array<[string, string]> = [
  ["banking-rules", "@/app/api/finance/accounting/banking-rules/route"],
  ["account-types", "@/app/api/finance/accounting/account-types/route"],
  ["accountants", "@/app/api/finance/accounting/accountants/route"],
  ["hr departments", "@/app/api/hr/departments/route"],
];

const get = (GET: any, url: string) => GET(new NextRequest(url));

describe("G5 — tenant-sensitive endpoints are never HTTP-cacheable", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  for (const [name, path] of ENDPOINTS) {
    it(`${name}: success responses for two organisations are private, no-store and carry no max-age / s-maxage / stale-while-revalidate`, async () => {
      const { GET } = await import(/* @vite-ignore */ path);
      for (const tenant of [A, B]) {
        vi.mocked(auth).mockResolvedValue(mockSession(tenant) as any);
        const res = await get(GET, `http://x/api/${name}`);
        expect(res.status).toBe(200);
        const cc = res.headers.get("cache-control");
        expect(cc).toBe(NO_STORE);
        expect(cc).not.toMatch(/max-age|s-maxage|stale-while-revalidate|public/);
      }
    });

    it(`${name}: unauthenticated (401) response is not cacheable either`, async () => {
      const { GET } = await import(/* @vite-ignore */ path);
      vi.mocked(auth).mockResolvedValue(null as any);
      const res = await get(GET, `http://x/api/${name}`);
      expect([401, 403]).toContain(res.status);
      const cc = res.headers.get("cache-control") ?? "";
      expect(cc).not.toMatch(/max-age=[1-9]|s-maxage|public/);
    });
  }

  it("HR departments: Organization A's data never appears in Organization B's response (logout/account switch)", async () => {
    const { GET } = await import("@/app/api/hr/departments/route");
    vi.mocked(auth).mockResolvedValue(mockSession(A) as any);
    await get(GET, "http://x/api/hr/departments"); // seeds defaults
    await Department.create({ tenantId: A, name: "Secret A-only Dept", code: "SECA", isActive: true, createdBy: new mongoose.Types.ObjectId() } as any);

    const resA = await get(GET, "http://x/api/hr/departments");
    expect((await resA.json()).items.some((d: any) => d.name === "Secret A-only Dept")).toBe(true);

    vi.mocked(auth).mockResolvedValue(mockSession(B) as any);
    const resB = await get(GET, "http://x/api/hr/departments");
    const bodyB = await resB.json();
    expect(bodyB.items.some((d: any) => d.name === "Secret A-only Dept")).toBe(false);
    expect(bodyB.items.every((d: any) => d.tenantId === B)).toBe(true);
  });

  it("HR departments: a newly created department is visible on the very next request (no stale cache window)", async () => {
    const { GET } = await import("@/app/api/hr/departments/route");
    vi.mocked(auth).mockResolvedValue(mockSession(A) as any);
    await Department.create({ tenantId: A, name: "Created Just Now", code: "NEW1", isActive: true, createdBy: new mongoose.Types.ObjectId() } as any);
    const res = await get(GET, "http://x/api/hr/departments");
    expect((await res.json()).items.some((d: any) => d.name === "Created Just Now")).toBe(true);
    expect(res.headers.get("cache-control")).toBe(NO_STORE);
  });
});
