import { describe, expect, it } from "vitest";
import { detectAccountingActionIntent } from "@/lib/accounting/aiIntent";

describe("detectAccountingActionIntent", () => {
  it("detects a create-account request with an explicit type prefix", () => {
    const intent = detectAccountingActionIntent("create an expense account called Marketing");
    expect(intent).not.toBeNull();
    expect(intent?.actionType).toBe("create_account");
    expect(intent?.params).toMatchObject({ accountName: "Marketing", accountType: "Expense" });
  });

  it("detects a create-account request using 'named' and an explicit type suffix", () => {
    const intent = detectAccountingActionIntent("create an account named Rent Payable of type Liability");
    expect(intent).not.toBeNull();
    expect(intent?.params).toMatchObject({ accountName: "Rent Payable", accountType: "Liability" });
  });

  it("detects a lock-transactions request with a parseable date", () => {
    const intent = detectAccountingActionIntent("lock Sales transactions up to 31 Mar 2026");
    expect(intent).not.toBeNull();
    expect(intent?.actionType).toBe("lock_transactions");
    expect(intent?.params.module).toBe("sales");
    expect(new Date(intent?.params.lockedUpToDate as string).getUTCFullYear()).toBe(2026);
  });

  it("captures an optional reason on a lock request", () => {
    const intent = detectAccountingActionIntent("lock all transactions up to 2026-03-31 because year end close");
    expect(intent?.params.reason).toBe("year end close");
  });

  it("rejects a lock request for an unknown module", () => {
    const intent = detectAccountingActionIntent("lock inventory transactions up to 2026-03-31");
    expect(intent).toBeNull();
  });

  it("rejects a lock request with an unparseable date", () => {
    const intent = detectAccountingActionIntent("lock sales transactions up to whenever");
    expect(intent).toBeNull();
  });

  it("detects an unlock-transactions request", () => {
    const intent = detectAccountingActionIntent("unlock banking transactions");
    expect(intent).toEqual({ actionType: "unlock_transactions", params: { module: "banking" } });
  });

  it("returns null for a plain analytics question", () => {
    expect(detectAccountingActionIntent("show me my budget vs actuals")).toBeNull();
    expect(detectAccountingActionIntent("what was my revenue last month?")).toBeNull();
  });
});
