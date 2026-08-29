import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/models/finance/Account", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import { buildActionPreview, AiActionError } from "@/lib/accounting/aiActions";
import Account from "@/models/finance/Account";

describe("buildActionPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews create_account without touching the database", async () => {
    const preview = await buildActionPreview(
      "create_account" as any,
      { accountName: "Marketing", accountType: "Expense" },
      "t1",
    );
    expect(preview.summary).toContain("Marketing");
    expect(preview.summary).toContain("Expense");
  });

  it("previews lock_transactions and rejects an invalid module", async () => {
    const preview = await buildActionPreview(
      "lock_transactions" as any,
      { module: "sales", lockedUpToDate: "2026-03-31" },
      "t1",
    );
    expect(preview.summary).toContain("sales");

    await expect(
      buildActionPreview("lock_transactions" as any, { module: "not_real", lockedUpToDate: "2026-03-31" }, "t1"),
    ).rejects.toThrow(AiActionError);
  });

  it("requires lockedUpToDate for lock_transactions", async () => {
    await expect(buildActionPreview("lock_transactions" as any, { module: "sales" }, "t1")).rejects.toThrow(
      /lockedUpToDate is required/,
    );
  });

  it("previews delete_account using the existing account, and blocks locked accounts", async () => {
    vi.mocked(Account.findOne).mockReturnValue({ lean: () => Promise.resolve({ _id: "a1", accountName: "Cash", isLocked: false }) } as any);
    const preview = await buildActionPreview("delete_account" as any, { accountId: "a1" }, "t1");
    expect(preview.summary).toContain("Cash");

    vi.mocked(Account.findOne).mockReturnValue({ lean: () => Promise.resolve({ _id: "a2", accountName: "System Cash", isLocked: true }) } as any);
    await expect(buildActionPreview("delete_account" as any, { accountId: "a2" }, "t1")).rejects.toThrow(/locked/i);
  });

  it("throws for an account that doesn't exist", async () => {
    vi.mocked(Account.findOne).mockReturnValue({ lean: () => Promise.resolve(null) } as any);
    await expect(buildActionPreview("delete_account" as any, { accountId: "missing" }, "t1")).rejects.toThrow(/not found/i);
  });

  it("rejects an unsupported action type", async () => {
    await expect(buildActionPreview("not_a_real_action" as any, {}, "t1")).rejects.toThrow(AiActionError);
  });
});
