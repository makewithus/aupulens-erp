import { describe, expect, it, vi, beforeEach } from "vitest";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";
import TransactionLock from "@/models/finance/TransactionLock";

vi.mock("@/models/finance/TransactionLock", () => {
  return {
    default: {
      find: vi.fn(),
    },
  };
});

function mockLeanFind(result: unknown[]) {
  vi.mocked(TransactionLock.find).mockReturnValue({ lean: () => Promise.resolve(result) } as any);
}

describe("assertTransactionNotLocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when no date is provided", async () => {
    await expect(assertTransactionNotLocked("t1", "sales", undefined)).resolves.toBeUndefined();
    expect(TransactionLock.find).not.toHaveBeenCalled();
  });

  it("allows a transaction dated after the lock date", async () => {
    mockLeanFind([{ module: "sales", isLocked: true, lockedUpToDate: new Date("2026-03-31") }]);
    await expect(assertTransactionNotLocked("t1", "sales", "2026-04-01")).resolves.toBeUndefined();
  });

  it("blocks a transaction dated on the lock date", async () => {
    mockLeanFind([{ module: "sales", isLocked: true, lockedUpToDate: new Date("2026-03-31") }]);
    await expect(assertTransactionNotLocked("t1", "sales", "2026-03-31")).rejects.toThrow(TransactionLockError);
  });

  it("blocks a transaction dated before the lock date", async () => {
    mockLeanFind([{ module: "sales", isLocked: true, lockedUpToDate: new Date("2026-03-31") }]);
    await expect(assertTransactionNotLocked("t1", "sales", "2026-01-15")).rejects.toThrow(/locked up to/i);
  });

  it("is blocked by a global 'all' lock even if the module itself isn't locked", async () => {
    mockLeanFind([{ module: "all", isLocked: true, lockedUpToDate: new Date("2026-06-30") }]);
    await expect(assertTransactionNotLocked("t1", "purchases", "2026-05-01")).rejects.toThrow(TransactionLockError);
  });

  it("allows when the lock query returns no active locks", async () => {
    mockLeanFind([]);
    await expect(assertTransactionNotLocked("t1", "banking", "2020-01-01")).resolves.toBeUndefined();
  });
});
