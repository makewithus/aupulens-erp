import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_pagination";
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Project from "@/models/shared/Project";
import { MAX_PAGE_SIZE, parsePageRequest } from "@/lib/api/pagination";
import { invalidateCache } from "@/lib/api/serverCache";

let GET: any;
const session = (tenantId: string, role = "project") => ({ user: { id: new mongoose.Types.ObjectId().toString(), tenantId, role } }) as any;
const call = async (qs = "", s = session("pg-a")) => {
  vi.mocked(auth).mockResolvedValue(s);
  const res = await GET(new NextRequest(`http://x/api/projects${qs}`));
  return { status: res.status, body: await res.json() };
};
const owner = new mongoose.Types.ObjectId();
const seed = (tenantId: string, n: number, sameTimestamp = false) => {
  const base = Date.now() - 1_000_000;
  return Project.insertMany(Array.from({ length: n }, (_, i) => ({ tenantId, name: `${tenantId}-p${i}`, ownerId: owner, createdBy: owner, createdAt: new Date(sameTimestamp ? base : base + i * 1000) })), { timestamps: false } as any);
};

beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await Project.init(); ({ GET } = await import("@/app/api/projects/route")); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });
afterEach(async () => { await Project.deleteMany({}); invalidateCache("projects-list:"); }); // the legacy route keeps a 20 s per-tenant server cache

async function traverse(limit: number, s = session("pg-a")) {
  const ids: string[] = []; let cursor = ""; let pages = 0;
  for (;;) {
    const { body } = await call(`?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`, s);
    ids.push(...body.data.map((p: any) => String(p._id))); pages++;
    if (!body.pagination.hasNext) break;
    cursor = body.pagination.nextCursor;
    if (pages > 50) throw new Error("runaway");
  }
  return { ids, pages };
}

describe("G2 — opt-in keyset pagination (GET /api/projects)", () => {
  it("backward compatible: no pagination params returns the complete legacy response shape", async () => {
    await seed("pg-a", 60);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(60);
    expect(body.pagination).toBeUndefined();
  });

  it("traverses every record exactly once, in the same order as the full list, with no duplicates", async () => {
    await seed("pg-a", 60);
    // The legacy endpoint sorts by createdAt only, so rows with equal timestamps have no defined order there;
    // the paginated order is the deterministic total order (createdAt desc, _id desc).
    const legacy = (await call()).body.data.map((p: any) => String(p._id));
    const expected = (await Project.find({ tenantId: "pg-a" }).sort({ createdAt: -1, _id: -1 }).select("_id").lean()).map((p: any) => String(p._id));
    const { ids, pages } = await traverse(25);
    expect(pages).toBe(3);
    expect(ids).toEqual(expected);
    expect([...legacy].sort()).toEqual([...ids].sort()); // identical record set as the full list
    expect(new Set(ids).size).toBe(60);
  });

  it("stable total order even when every row has the identical sort value (bulk import)", async () => {
    await seed("pg-a", 55, true);
    const { ids } = await traverse(10);
    expect(ids).toHaveLength(55);
    expect(new Set(ids).size).toBe(55);
  });

  it("rows inserted at the head while paging neither duplicate nor skip existing rows", async () => {
    await seed("pg-a", 30);
    const first = await call("?limit=10");
    const seen = first.body.data.map((p: any) => String(p._id));
    await Project.create({ tenantId: "pg-a", name: "brand-new", ownerId: owner, createdBy: owner });
    let cursor = first.body.pagination.nextCursor; let hasNext = first.body.pagination.hasNext;
    while (hasNext) { const r = await call(`?limit=10&cursor=${cursor}`); seen.push(...r.body.data.map((p: any) => String(p._id))); cursor = r.body.pagination.nextCursor; hasNext = r.body.pagination.hasNext; }
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it("empty result, exact-multiple boundary and last-page flags", async () => {
    const empty = await call("?limit=10");
    expect(empty.body.data).toEqual([]);
    expect(empty.body.pagination).toEqual({ limit: 10, hasNext: false, nextCursor: null });
    await seed("pg-a", 20);
    const p1 = await call("?limit=10"); const p2 = await call(`?limit=10&cursor=${p1.body.pagination.nextCursor}`);
    expect(p1.body.pagination.hasNext).toBe(true);
    expect(p2.body.data).toHaveLength(10);
    expect(p2.body.pagination.hasNext).toBe(false);
  });

  it("tenant isolation: another organisation's rows never appear, and a foreign cursor cannot reach them", async () => {
    await seed("pg-a", 12); await seed("pg-b", 12);
    const a = await traverse(5, session("pg-a"));
    const b = await traverse(5, session("pg-b"));
    expect(a.ids.filter((id) => b.ids.includes(id))).toEqual([]);
    const cursorFromB = (await call("?limit=5", session("pg-b"))).body.pagination.nextCursor;
    const viaA = await call(`?limit=100&cursor=${cursorFromB}`, session("pg-a"));
    expect(viaA.body.data.every((p: any) => p.tenantId === "pg-a")).toBe(true);
  });

  it("RBAC unchanged: a role outside the allow-list still gets 403, unauthenticated 401", async () => {
    await seed("pg-a", 3);
    expect((await call("?limit=5", session("pg-a", "hr"))).status).toBe(403);
    vi.mocked(auth).mockResolvedValue(null as any);
    expect((await GET(new NextRequest("http://x/api/projects?limit=5"))).status).toBe(401);
  });

  it("rejects invalid limit / cursor and caps the page size", async () => {
    for (const qs of ["?limit=0", "?limit=-1", "?limit=abc", `?limit=${MAX_PAGE_SIZE + 1}`, "?limit=10&cursor=%%%", `?cursor=${Buffer.from("{}").toString("base64url")}`]) {
      expect((await call(qs)).status, qs).toBe(400);
    }
    await seed("pg-a", MAX_PAGE_SIZE + 20);
    expect((await call(`?limit=${MAX_PAGE_SIZE}`)).body.data).toHaveLength(MAX_PAGE_SIZE);
  });

  it("status filter composes with the cursor", async () => {
    await seed("pg-a", 10);
    await Project.updateMany({ name: /p[0-4]$/ }, { $set: { status: "active" } });
    const r = await call("?limit=3&status=active");
    expect(r.body.data.every((p: any) => p.status === "active")).toBe(true);
    expect(r.body.pagination.hasNext).toBe(true);
  });

  it("parsePageRequest: absent params => not requested", () => {
    expect(parsePageRequest(new URLSearchParams("status=all"))).toEqual({ requested: false });
  });
});
