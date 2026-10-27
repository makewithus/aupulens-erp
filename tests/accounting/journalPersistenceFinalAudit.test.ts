vi.mock("@/lib/accounting/journalPolicy", () => ({ journalPolicy: async () => null }));
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
vi.mock("@/lib/accounting/smart-rules", () => ({ applySemanticRulesAndClassify: async () => ({ ok: true }) }));
vi.mock("@/lib/accounting/transactionLock", () => ({ assertTransactionNotLocked: vi.fn(), TransactionLockError: class extends Error {} }));
import Entry from "@/models/finance/JournalEntry";
import { PATCH } from "@/app/api/finance/journal-entries/[id]/route";
const userId = new mongoose.Types.ObjectId();
const lines = [{ accountId: new mongoose.Types.ObjectId(), debit: 100, credit: 0 }, { accountId: new mongoose.Types.ObjectId(), debit: 0, credit: 100 }];
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 }); });
beforeEach(() => m.auth.mockResolvedValue({ user: { id: String(userId), tenantId: "journal-a", role: "finance" } }));
afterAll(async () => { if (mongoose.connection.name.startsWith("aupulens_test_")) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
async function fixture() {
  const _id = new mongoose.Types.ObjectId();
  await Entry.collection.insertOne({ _id, tenantId: "journal-a", createdBy: userId, status: "draft", voucherStatus: "draft", approvalRequired: true, header: { name: `AUDIT-${_id}`, date: new Date(), journalType: "general" }, lineIds: lines });
  return String(_id);
}
const patch = (id: string, body: any) => PATCH(new NextRequest(`http://localhost/api/finance/journal-entries/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const state = (id: string) => Entry.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
describe("Final audit: persisted journal transitions (policy/period services mocked)", () => {
  it("rejects both quick-post representations without changing persisted state", async () => {
    const id = await fixture(), before = await state(id);
    for (const body of [{ status: "posted" }, { status: "posted", voucherStatus: "draft" }, { voucherStatus: "posted" }]) {
      expect((await patch(id, body)).status).toBe(400);
      expect(await state(id)).toEqual(before);
    }
  });
  it("persists a valid approval lifecycle and makes posting immutable", async () => {
    const id = await fixture();
    for (const voucherStatus of ["validated", "pending_approval", "approved", "posted"]) {
      expect((await patch(id, { voucherStatus })).status).toBe(200);
      expect((await state(id))?.voucherStatus).toBe(voucherStatus);
    }
    const posted = await state(id);
    expect(posted?.status).toBe("posted");
    expect(String(posted?.approvalDetails?.approvedBy)).toBe(String(userId));
    expect((await patch(id, { lineIds: lines.map(line => ({ ...line, debit: line.debit * 2, credit: line.credit * 2 })) })).status).toBe(400);
    expect(await state(id)).toEqual(posted);
  });
  it("rejects foreign and unauthorized updates without changing persisted state", async () => {
    const id = await fixture(), before = await state(id);
    m.auth.mockResolvedValue({ user: { id: String(userId), tenantId: "journal-b", role: "finance" } });
    expect((await patch(id, { voucherStatus: "validated" })).status).toBe(404);
    m.auth.mockResolvedValue({ user: { id: String(userId), tenantId: "journal-a", role: "sales" } });
    expect((await patch(id, { voucherStatus: "validated" })).status).toBe(403);
    expect(await state(id)).toEqual(before);
  });
  it("rejects an unbalanced update without partial writes", async () => {
    const id = await fixture(), before = await state(id);
    expect((await patch(id, { lineIds: [{ ...lines[0], debit: 150 }, lines[1]] })).status).toBe(400);
    expect(await state(id)).toEqual(before);
  });
});
