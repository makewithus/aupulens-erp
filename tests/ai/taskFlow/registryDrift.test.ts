/**
 * BRIEF-SARVAM-2 §1.4 — THE REGISTRY DRIFT TEST. It FAILS the build (it does not warn) when the
 * real route, the real model, or the middleware role gate changes without lib/ai/taskFlow/registry.ts
 * changing with it. The day someone adds a mandatory field, CI breaks here — instead of the assistant
 * quietly producing pre-filled forms / records the route rejects.
 *
 * Three sources, one registry:
 *   1. the ROUTE's own checks       (parsed from app/api/sales/invoices/route.ts)
 *   2. the MODEL's required paths   (introspected from the Mongoose schema)
 *   3. the MIDDLEWARE role gate     (parsed from middleware.ts)
 * plus a behavioural check that the payload the registry builds is accepted by the real route and
 * that removing each required field is rejected.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_taskflow_drift";
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { TASK_TARGETS, SALES_INVOICE_TARGET } from "@/lib/ai/taskFlow/registry";
import { makeRequest, mockSession } from "../../accounting/_helpers/routeTestUtils";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const T = SALES_INVOICE_TARGET;
const MSG = (what: string) => `REGISTRY DRIFT: ${what}\n→ update lib/ai/taskFlow/registry.ts (and the assistant's questions) to match, then re-run. This test failing on purpose is the safeguard.`;

// ── model introspection ──────────────────────────────────────────────────────────
function walk(schema: any, prefix = ""): { required: Set<string>; min: Record<string, number> } {
  const required = new Set<string>();
  const min: Record<string, number> = {};
  for (const [name, p] of Object.entries<any>(schema.paths)) {
    if (["_id", "__v", "createdAt", "updatedAt"].includes(name)) continue;
    const full = prefix + name;
    if (p.schema && p.$isMongooseDocumentArray) {
      const sub = walk(p.schema, `${full}.`);
      sub.required.forEach((r) => required.add(r));
      Object.assign(min, sub.min);
      if (p.isRequired) required.add(full);
    } else {
      if (p.isRequired) required.add(full);
      if (typeof p.options?.min === "number") min[full] = p.options.min;
    }
  }
  return { required, min };
}
const model = walk((SalesInvoice as any).schema);
const underOptionalArray = (p: string) => T.validation.modelOptionalArrays.some((a) => p === a || p.startsWith(`${a}.`));

describe("registry ↔ MODEL: required paths", () => {
  it("every path the model requires is declared (user-supplied or server-derived) — or belongs to an optional array", () => {
    const declared = new Set([...T.validation.modelRequired, ...T.validation.modelServerDerived]);
    const missing = [...model.required].filter((p) => !declared.has(p) && !underOptionalArray(p));
    expect(missing, MSG(`the model SalesInvoice now requires ${JSON.stringify(missing)} which the registry does not know about`)).toEqual([]);
  });
  it("every path the registry declares is really required by the model (no stale entries)", () => {
    const stale = [...T.validation.modelRequired, ...T.validation.modelServerDerived].filter((p) => !model.required.has(p));
    expect(stale, MSG(`the registry declares ${JSON.stringify(stale)} but the model no longer requires it`)).toEqual([]);
  });
  it("minimum-value rules match (qty ≥ 1, unitPrice ≥ 0)", () => {
    const modelMins: Record<string, number> = {};
    for (const p of T.validation.modelRequired) if (p in model.min) modelMins[p] = model.min[p];
    expect(modelMins, MSG("a min/max rule on a user-supplied required field changed")).toEqual(T.validation.modelMin);
  });
});

describe("registry ↔ ROUTE: the checks the route itself enforces", () => {
  const src = read(T.validation.routeSource);
  const post = src.slice(src.indexOf("export async function POST"));
  const block = post.slice(post.indexOf("if (!isDraft)"), post.indexOf("const org = await"));
  it("the non-draft validation block was found (the route was not restructured out from under this test)", () => {
    expect(block.length, MSG("could not find `if (!isDraft) {…}` in the invoice POST route — update the parser in this test and the registry")).toBeGreaterThan(20);
  });
  it("the set of required body fields equals the registry's routeRequired", () => {
    const found = new Set<string>();
    for (const m of block.matchAll(/if \(!body\.(\w+)\)/g)) found.add(m[1]);
    for (const m of block.matchAll(/!Array\.isArray\(body\.(\w+)\)/g)) found.add(m[1]);
    expect([...found].sort(), MSG(`the route now enforces ${JSON.stringify([...found])}`)).toEqual([...T.validation.routeRequired].sort());
  });
  it("the route still creates drafts without those checks (so the assistant's status:draft path stays valid)", () => {
    expect(post).toMatch(/const isDraft = body\.status === SALES_INVOICE_STATUS\.DRAFT/);
  });
});

describe("registry ↔ MIDDLEWARE: who may use the module", () => {
  it("allowedRoles equals the role gate on /sales and /api/sales", () => {
    const mw = read("middleware.ts");
    const i = mw.indexOf('pathname.startsWith("/sales")');
    expect(i, MSG("the /sales gate was not found in middleware.ts")).toBeGreaterThan(-1);
    const gate = mw.slice(i, mw.indexOf("handleForbidden", i));
    const roles = [...gate.matchAll(/user\.role !== "([\w-]+)"/g)].map((m) => m[1]).sort();
    expect(roles, MSG(`middleware now allows ${JSON.stringify(roles)} on /sales`)).toEqual([...T.allowedRoles].sort());
  });
});

describe("registry internal consistency", () => {
  it("every required path (route + model, user-supplied) is covered by some slot", () => {
    const covered = new Set(T.slots.filter((s) => s.required || s.default).flatMap((s) => s.satisfies));
    const needed = [...T.validation.routeRequired, ...T.validation.modelRequired];
    const uncovered = needed.filter((p) => !covered.has(p));
    expect(uncovered, MSG(`no slot supplies ${JSON.stringify(uncovered)} — the assistant could not produce a valid record`)).toEqual([]);
  });
  it("every slot's `satisfies` refers to a real path; defaults obey the model's minimums", () => {
    const known = new Set([...T.validation.routeRequired, ...T.validation.modelRequired]);
    for (const s of T.slots) for (const p of s.satisfies) expect(known.has(p), `slot ${s.key} satisfies unknown path ${p}`).toBe(true);
    const qty = T.slots.find((s) => s.key === "quantity")!;
    expect(Number(qty.default!.value)).toBeGreaterThanOrEqual(T.validation.modelMin["lineItems.qty"]);
  });
  it("targets are keyed consistently and expose routes that exist in the app", () => {
    for (const [k, t] of Object.entries(TASK_TARGETS)) {
      expect(t.id).toBe(k);
      expect(fs.existsSync(path.join(ROOT, "app", t.formRoute, "page.tsx"))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, "app", t.createEndpoint, "route.ts"))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, "app", "sales/invoices/[id]/page.tsx"))).toBe(true);
    }
  });
});

describe("registry ↔ REAL ROUTE (behavioural)", () => {
  const TENANT = "t-taskflow-drift";
  const URL = "http://localhost/api/sales/invoices";
  let POST: typeof import("@/app/api/sales/invoices/route").POST;
  let customerId = "";

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Customer.init();
    await SalesInvoice.init();
    ({ POST } = await import("@/app/api/sales/invoices/route"));
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });
  afterEach(async () => { await (SalesInvoice as any).deleteMany({ tenantId: TENANT }); await Customer.deleteMany({ tenantId: TENANT }); vi.mocked(auth).mockReset(); });

  const payload = async (over: Record<string, unknown> = {}) => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const c = await Customer.create({ tenantId: TENANT, header: { name: "Drift Co", displayName: "Drift Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    customerId = String(c._id);
    return { ...T.toPayload({ customer: { id: customerId, name: "Drift Co" }, itemName: "Widget", unitPrice: 100, quantity: 2, dueDate: "2026-10-30" }, { today: "2026-09-19" }), ...over } as any;
  };
  const post = (body: unknown) => POST(makeRequest(URL, { method: "POST", body: JSON.stringify(body) }));

  it("the payload the registry builds is ACCEPTED by the real route, as a DRAFT (no GL posting)", async () => {
    const res = await post(await payload());
    expect(res.status, MSG("the real route rejected the registry's own payload")).toBe(201);
    const json = await res.json();
    expect(json.data.status).toBe("draft");
    expect(json.data.totalAmount).toBe(200);
  });
  it("route-required fields: removing each is REJECTED with 400 for an issued (non-draft) invoice", async () => {
    for (const f of T.validation.routeRequired) {
      const body = await payload({ status: "saved" });
      delete body[f];
      expect((await post(body)).status, `route accepted a non-draft invoice without ${f}`).toBe(400);
    }
  });
  it("model-required user-supplied fields: removing/violating each is REJECTED (not silently stored)", async () => {
    const mutate: Record<string, (b: any) => void> = {
      customerId: (b) => { delete b.customerId; },
      "lineItems.name": (b) => { delete b.lineItems[0].name; },
      "lineItems.qty": (b) => { delete b.lineItems[0].qty; },
      "lineItems.unitPrice": (b) => { delete b.lineItems[0].unitPrice; },
    };
    expect(Object.keys(mutate).sort(), MSG("a new user-supplied required path needs a mutation here")).toEqual([...T.validation.modelRequired].sort());
    for (const f of T.validation.modelRequired) {
      const body = await payload();
      mutate[f](body);
      expect((await post(body)).status, `real route accepted an invoice missing ${f}`).toBeGreaterThanOrEqual(400);
    }
    const q0 = await payload(); q0.lineItems[0].qty = 0;
    expect((await post(q0)).status).toBeGreaterThanOrEqual(400);
    const neg = await payload(); neg.lineItems[0].unitPrice = -1;
    expect((await post(neg)).status).toBeGreaterThanOrEqual(400);
  });
});
