import { describe, expect, it, vi, beforeEach } from "vitest";
import { runPOMatching } from "@/lib/accounting/matching";
import Invoice from "@/models/Invoice";
import PurchaseOrder from "@/models/PurchaseOrder";

vi.mock("@/models/Invoice", () => {
  return {
    default: {
      findOne: vi.fn(),
    },
  };
});

vi.mock("@/models/PurchaseOrder", () => {
  return {
    default: {
      findOne: vi.fn(),
    },
  };
});

describe("Purchase Order Matching (2-Way & 3-Way)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully matches 2-way when price and quantity match PO exactly", async () => {
    const mockInvoice = {
      _id: "inv123",
      moveType: "in_invoice",
      poReference: "PO/2026/0001",
      poMatchType: "2_way",
      poMatchStatus: "pending",
      invoiceLines: [
        {
          productId: "prod1",
          name: "Laptop",
          quantity: 2,
          priceUnit: 50000,
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    const mockPO = {
      _id: "po123",
      name: "PO/2026/0001",
      orderLines: [
        {
          productId: "prod1",
          name: "Laptop",
          productQty: 2,
          priceUnit: 50000,
          billedQty: 0,
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    vi.mocked(Invoice.findOne).mockResolvedValue(mockInvoice as any);
    vi.mocked(PurchaseOrder.findOne).mockResolvedValue(mockPO as any);

    const result = await runPOMatching("inv123", "default-tenant");

    expect(result?.poMatchStatus).toBe("matched");
    expect(result?.manualReviewRequired).toBe(false);
    expect(mockInvoice.poMatchStatus).toBe("matched");
    expect(mockPO.orderLines[0].billedQty).toBe(2);
  });

  it("detects a mismatch when bill price exceeds PO price", async () => {
    const mockInvoice = {
      _id: "inv123",
      moveType: "in_invoice",
      poReference: "PO/2026/0001",
      poMatchType: "2_way",
      invoiceLines: [
        {
          productId: "prod1",
          name: "Laptop",
          quantity: 2,
          priceUnit: 55000, // Exceeds PO unit price (50000)
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    const mockPO = {
      _id: "po123",
      name: "PO/2026/0001",
      orderLines: [
        {
          productId: "prod1",
          name: "Laptop",
          productQty: 2,
          priceUnit: 50000,
          billedQty: 0,
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    vi.mocked(Invoice.findOne).mockResolvedValue(mockInvoice as any);
    vi.mocked(PurchaseOrder.findOne).mockResolvedValue(mockPO as any);

    const result = await runPOMatching("inv123", "default-tenant");

    expect(result?.poMatchStatus).toBe("mismatch");
    expect(result?.manualReviewRequired).toBe(true);
    expect(result?.discrepancyNotes).toContain("Price mismatch");
  });

  it("detects a mismatch when 3-way matching is active and bill quantity exceeds received quantity", async () => {
    const mockInvoice = {
      _id: "inv123",
      moveType: "in_invoice",
      poReference: "PO/2026/0001",
      poMatchType: "3_way", // 3-way matching active
      invoiceLines: [
        {
          productId: "prod1",
          name: "Laptop",
          quantity: 2, // Wants to bill 2 units
          priceUnit: 50000,
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    const mockPO = {
      _id: "po123",
      name: "PO/2026/0001",
      orderLines: [
        {
          productId: "prod1",
          name: "Laptop",
          productQty: 5,
          priceUnit: 50000,
          receivedQty: 1, // Only 1 unit received so far via Goods Receipt
          billedQty: 0,
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };

    vi.mocked(Invoice.findOne).mockResolvedValue(mockInvoice as any);
    vi.mocked(PurchaseOrder.findOne).mockResolvedValue(mockPO as any);

    const result = await runPOMatching("inv123", "default-tenant");

    expect(result?.poMatchStatus).toBe("mismatch");
    expect(result?.manualReviewRequired).toBe(true);
    expect(result?.discrepancyNotes).toContain("exceeds received quantity");
  });
});
