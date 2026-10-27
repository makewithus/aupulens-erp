vi.mock("@/lib/accounting/journalPolicy", () => ({ journalPolicy: async () => null }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/finance/JournalEntry", () => ({ default: { findOne: mocks.find, findOneAndUpdate: mocks.update } }));
vi.mock("@/lib/accounting/smart-rules", () => ({ applySemanticRulesAndClassify: async () => ({ ok: true }) }));
vi.mock("@/lib/accounting/transactionLock", () => ({ assertTransactionNotLocked: vi.fn(), TransactionLockError: class extends Error {} }));
vi.mock("@/lib/accounting/posting", () => ({ createJournalEntry: mocks.create }));
import { PATCH } from "@/app/api/finance/journal-entries/[id]/route";
import { POST } from "@/app/api/finance/journal-entries/route";
const id = "507f1f77bcf86cd799439011";
const lines = [{ accountId: id, debit: 100, credit: 0 }, { accountId: "507f1f77bcf86cd799439012", debit: 0, credit: 100 }];
const request = (body: any) => new NextRequest(`http://localhost/api/finance/journal-entries/${id}`, { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id, tenantId: "audit-tenant", role: "finance" } });
  mocks.find.mockResolvedValue({ status: "draft", voucherStatus: "draft", header: { date: new Date() }, lineIds: lines, approvalRequired: true });
  mocks.update.mockResolvedValue({ status: "posted", voucherStatus: "posted" });
  mocks.create.mockResolvedValue({ status: "posted" });
});
describe("Final audit: journal alternate posting and authority fields", () => {
  it("rejects conflicting document/voucher states instead of bypassing draft-to-posted protection", async () => {
    const response = await PATCH(request({ status: "posted", voucherStatus: "draft" }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not allow generic updates to forge approvals, audit timestamps or approval policy", async () => {
    const response = await PATCH(request({ "approvalDetails.approvedBy": id, approvalRequired: false, validatedBy: id, ledgerUpdatedAt: "2020-01-01", memo: "Valid edit" }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    const set = mocks.update.mock.calls[0][1].$set;
    expect(set.memo).toBe("Valid edit");
    for (const key of ["approvalDetails.approvedBy", "approvalRequired", "validatedBy", "ledgerUpdatedAt"]) expect(set).not.toHaveProperty(key);
  });
  it.each(["posted", "approved", "validated"])("rejects public creation directly in %s state", async (state) => {
    const response = await POST(request({ status: state === "posted" ? "posted" : "draft", voucherStatus: state, lineIds: lines }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires finance authorization on direct journal creation", async () => {
    mocks.auth.mockResolvedValue({ user: { id, tenantId: "audit-tenant", role: "sales" } });
    expect((await POST(request({ lineIds: lines }))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires pending approval when the existing journal requires approval", async () => {
    mocks.find.mockResolvedValue({ status: "draft", voucherStatus: "validated", header: { date: new Date() }, lineIds: lines, approvalRequired: true });
    const response = await PATCH(request({ voucherStatus: "approved" }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
