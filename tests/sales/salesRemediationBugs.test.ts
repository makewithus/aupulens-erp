import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { computeInvoiceTotals, computeHsnSummary, InvoiceLineInput } from "@/lib/sales/invoiceMath";
import { formatSalesDate, formatSalesCurrency } from "@/lib/sales/formatters";
import { resolveInvoiceStatus } from "@/lib/sales/invoiceStatus";
import { isAccountingArtifact, dryRunAuditProductArtifacts } from "@/lib/sales/productSanitize";
import { diagnoseSalesOrder, dryRunRepairSalesOrder } from "@/lib/sales/salesOrderDiagnostics";
import { transitionDeal } from "@/lib/sales/pipelineDeals";
import { Q2C_STATUS, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SaleOrder from "@/models/sales/SaleOrder";
import Product from "@/models/inventory/Product";
import { validateAllocationAmounts, validateAllocations } from "@/lib/sales/paymentAllocation";

const TENANT = "t-remediation-bugs-test";
const USER_ID = new mongoose.Types.ObjectId().toString();

describe("Phase 2 & Phase 3 Remediation Tests", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27183/aupulens_test_remediation");
    }
    await Customer.init();
    await SalesInvoice.init();
    await SaleOrder.init();
    await Product.init();
  });

  afterAll(async () => {
    await Customer.deleteMany({ tenantId: TENANT });
    await SalesInvoice.deleteMany({ tenantId: TENANT });
    await SaleOrder.deleteMany({ tenantId: TENANT });
    await Product.deleteMany({ tenantId: TENANT });
  });

  // ---------------------------------------------------------------------------
  // SALES-BUG-004: Invoice adjustment row and tax presentation
  // ---------------------------------------------------------------------------
  describe("SALES-BUG-004: Invoice adjustment row and tax presentation", () => {
    it("handles positive and negative non-taxable adjustments without corrupting taxable amount", () => {
      const lines: InvoiceLineInput[] = [
        { name: "Consulting", qty: 2, unitPrice: 1000, discount: 10, discountMode: "percent", taxRate: 18, hsn: "9983" },
      ];
      // Positive adjustment (e.g. freight/delivery charge)
      const resPos = computeInvoiceTotals({
        lineItems: lines,
        additionalCharges: [{ name: "Delivery", amount: 100, isTaxable: false }],
        sellerState: "Maharashtra",
        placeOfSupply: "Maharashtra",
      });
      // Gross = 2000, Discount = 200, Taxable = 1800.
      // CGST (9%) = 162, SGST (9%) = 162. Total tax = 324.
      // Final total = 1800 + 324 + 100 = 2224.
      expect(resPos.subtotal).toBe(2000);
      expect(resPos.totalDiscount).toBe(200);
      expect(resPos.taxableAmount).toBe(1800);
      expect(resPos.totalTax).toBe(324);
      expect(resPos.additionalChargesTotal).toBe(100);
      expect(resPos.nonTaxableAdditionalCharges).toBe(100);
      expect(resPos.totalAmount).toBe(2224);

      // Negative adjustment (e.g. round-off adjustment or goodwill credit)
      const resNeg = computeInvoiceTotals({
        lineItems: lines,
        additionalCharges: [{ name: "Goodwill Adjustment", amount: -50, isTaxable: false }],
        sellerState: "Maharashtra",
        placeOfSupply: "Maharashtra",
      });
      expect(resNeg.taxableAmount).toBe(1800);
      expect(resNeg.totalTax).toBe(324);
      expect(resNeg.additionalChargesTotal).toBe(-50);
      expect(resNeg.nonTaxableAdditionalCharges).toBe(-50);
      expect(resNeg.totalAmount).toBe(2074);
    });

    it("handles taxable adjustments correctly by adding to taxable value", () => {
      const lines: InvoiceLineInput[] = [
        { name: "Item A", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 18, hsn: "8471" },
      ];
      const res = computeInvoiceTotals({
        lineItems: lines,
        additionalCharges: [{ name: "Taxable Packaging", amount: 200, isTaxable: true }],
        sellerState: "Maharashtra",
        placeOfSupply: "Maharashtra",
      });
      expect(res.subtotal).toBe(1000);
      expect(res.taxableAdditionalCharges).toBe(200);
      expect(res.taxableAmount).toBe(1200);
      // 18% of 1200 = 216
      expect(res.totalTax).toBe(216);
      expect(res.totalAmount).toBe(1416);
    });

    it("computes HSN summary accurately with discounts and zero adjustments", () => {
      const lines: InvoiceLineInput[] = [
        { name: "Item A", qty: 2, unitPrice: 500, discount: 50, discountMode: "amount", taxRate: 12, hsn: "8471" },
      ];
      const totals = computeInvoiceTotals({
        lineItems: lines,
        additionalCharges: [],
        sellerState: "Maharashtra",
        placeOfSupply: "Maharashtra",
      });
      const hsnSummary = computeHsnSummary(totals.computedLines, totals.isInterState);
      expect(hsnSummary).toHaveLength(1);
      expect(hsnSummary[0].hsn).toBe("8471");
      // Gross 1000 - 50 discount = 950 taxable
      expect(hsnSummary[0].taxableValue).toBe(950);
      expect(hsnSummary[0].cgstAmount).toBe(57);
      expect(hsnSummary[0].sgstAmount).toBe(57);
      expect(hsnSummary[0].total).toBe(1064);
    });
  });

  // ---------------------------------------------------------------------------
  // SALES-BUG-011: Consistent Indian date formatting
  // ---------------------------------------------------------------------------
  describe("SALES-BUG-011: Consistent Indian date formatting", () => {
    it("formats standard ISO date strings to Indian DD/MM/YYYY format", () => {
      expect(formatSalesDate("2026-10-23T00:00:00.000Z")).toBe("23/10/2026");
      expect(formatSalesDate("2026-01-05")).toBe("05/01/2026");
      expect(formatSalesDate("2026-12-31")).toBe("31/12/2026");
    });

    it("handles Date objects safely across timezone boundaries", () => {
      const date = new Date("2026-08-15T12:00:00Z");
      expect(formatSalesDate(date)).toMatch(/15\/08\/2026/);
    });

    it("returns dash or fallback on invalid, null, or undefined dates", () => {
      expect(formatSalesDate(null)).toBe("—");
      expect(formatSalesDate(undefined)).toBe("—");
      expect(formatSalesDate("")).toBe("—");
      expect(formatSalesDate("not-a-date")).toBe("—");
    });
  });

  // ---------------------------------------------------------------------------
  // SALES-BUG-012: Indian currency formatting
  // ---------------------------------------------------------------------------
  describe("SALES-BUG-012: Indian currency formatting", () => {
    it("formats Indian numbers with consistent commas and currency symbol", () => {
      expect(formatSalesCurrency(12000)).toBe("₹12,000.00");
      expect(formatSalesCurrency(100000)).toBe("₹1,00,000.00");
      expect(formatSalesCurrency(1234567.89)).toBe("₹12,34,567.89");
      expect(formatSalesCurrency(0)).toBe("₹0.00");
    });

    it("handles negative numbers, decimals, and undefined safely", () => {
      expect(formatSalesCurrency(-500)).toBe("-₹500.00");
      expect(formatSalesCurrency(-12500.5)).toBe("-₹12,500.50");
      expect(formatSalesCurrency(undefined)).toBe("₹0.00");
      expect(formatSalesCurrency(null)).toBe("₹0.00");
    });
  });

  // ---------------------------------------------------------------------------
  // SALES-BUG-015: Payment form prefilled amount race and allocations
  // ---------------------------------------------------------------------------
  describe("SALES-BUG-015: Payment form prefilled allocation validation", () => {
    it("validates that per-invoice allocations do not exceed outstanding balance", () => {
      const invoices = [
        { _id: "inv-1", number: "INV-001", totalAmount: 1000, payments: [{ amount: 400 }] }, // due 600
      ];
      // Allocating 700 to an invoice with 600 due must throw validation error
      expect(() => {
        validateAllocationAmounts([{ invoiceId: "inv-1", amount: 700 }], invoices as any);
      }).toThrow(/outstanding/i);

      // Allocating <= 600 must pass
      expect(() => {
        validateAllocationAmounts([{ invoiceId: "inv-1", amount: 600 }], invoices as any);
      }).not.toThrow();
    });

    it("validates that total applied plus charges matches amount received", () => {
      // Amount received = 1000, allocations = 800, bankCharges = 0, tds = 0 => unused = 200
      const unused = validateAllocations([{ invoiceId: "inv-1", amount: 800 }], 1000, 0, 0);
      expect(unused).toBe(200);

      // Over-application throws
      expect(() => {
        validateAllocations([{ invoiceId: "inv-1", amount: 1100 }], 1000, 0, 0);
      }).toThrow(/exceed/i);
    });
  });

  // ---------------------------------------------------------------------------
  // S2: Historical sales order financial audit and dry run diagnostics
  // ---------------------------------------------------------------------------
  describe("S2: Historical sales order amount mismatch diagnostic", () => {
    it("detects discrepancy when stored amountTotal does not match line item totals", () => {
      const corruptedOrder = {
        header: { name: "SO-V3-81069" },
        orderLines: [
          { name: "Widget A", productQty: 10, priceUnit: 250, discount: 0, taxRate: 0 },
          { name: "Service B", productQty: 1, priceUnit: 1500, discount: 10, taxRate: 0 },
        ],
        totals: {
          amountUntaxed: 2500, // Missing second line in legacy import!
          amountTax: 0,
          amountTotal: 2500, // Should be 2500 + 1350 = 3850
        },
      };

      const audit = diagnoseSalesOrder(corruptedOrder);
      expect(audit.isValid).toBe(false);
      expect(audit.discrepancies.length).toBeGreaterThan(0);
      expect(audit.canAutoRepair).toBe(true);
      expect(audit.expectedTotals.amountTotal).toBe(3850);

      const dryRun = dryRunRepairSalesOrder(corruptedOrder);
      expect(dryRun.canRepair).toBe(true);
      expect(dryRun.proposedPatch?.["totals.amountTotal"]).toBe(3850);
    });

    it("passes cleanly on consistent sales orders", () => {
      const cleanOrder = {
        header: { name: "SO-CLEAN-001" },
        orderLines: [{ name: "Item", productQty: 2, priceUnit: 500, discount: 0, taxRate: 0 }],
        totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
      };
      const audit = diagnoseSalesOrder(cleanOrder);
      expect(audit.isValid).toBe(true);
      expect(audit.discrepancies).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // S3: Exclude accounting artifacts from product catalog
  // ---------------------------------------------------------------------------
  describe("S3: Accounting artifact detection and catalog exclusion", () => {
    it("identifies payment and receipt artifacts accurately", () => {
      const artifact1 = { header: { name: "Payment Received" }, tab_general_information: { list_price: 1 } };
      const artifact2 = { header: { name: "Customer Payment - INV-001" }, tab_general_information: { default_code: "PAY-100" } };
      const artifact3 = { header: { name: "Payment Receipt Voucher" }, tab_general_information: { list_price: 1 } };

      expect(isAccountingArtifact(artifact1)).toBe(true);
      expect(isAccountingArtifact(artifact2)).toBe(true);
      expect(isAccountingArtifact(artifact3)).toBe(true);
    });

    it("preserves legitimate products priced at ₹1", () => {
      const legitCheapProduct = {
        header: { name: "Promotional Plastic Ballpen" },
        tab_general_information: { default_code: "PEN-001", list_price: 1, hsnSacCode: "9608" },
      };
      expect(isAccountingArtifact(legitCheapProduct)).toBe(false);
    });

    it("runs dry-run audit on product catalog without mutating records", () => {
      const catalog = [
        { _id: "1", header: { name: "Payment Received" }, tab_general_information: { list_price: 1 } },
        { _id: "2", header: { name: "Executive Office Chair" }, tab_general_information: { list_price: 4500 } },
      ];
      const audit = dryRunAuditProductArtifacts(catalog);
      expect(audit.totalScanned).toBe(2);
      expect(audit.artifactCount).toBe(1);
      expect(audit.legitimateCount).toBe(1);
      expect(audit.artifacts[0].name).toBe("Payment Received");
    });
  });

  // ---------------------------------------------------------------------------
  // S4: Pipeline deal state machine and reopening lost deals
  // ---------------------------------------------------------------------------
  describe("S4: Pipeline deal lifecycle and transitions", () => {
    it("allows re-opening a lost order deal back into the pipeline", async () => {
      const customer = await Customer.create({
        tenantId: TENANT,
        header: { name: "Deal Customer" },
        createdBy: new mongoose.Types.ObjectId(),
      });

      const order: any = await (SaleOrder as any).create({
        tenantId: TENANT,
        header: { name: `SO-DEAL-${Date.now()}`, partnerId: customer._id, dateOrder: new Date() },
        totals: { amountTotal: 5000, amountUntaxed: 5000, amountTax: 0 },
        q2cStatus: Q2C_STATUS.LOST,
        status: DOCUMENT_STATUS.REJECTED,
      });

      // Re-opening from LOST to LEAD
      const res = await transitionDeal({
        tenantId: TENANT,
        userId: USER_ID,
        kind: "order",
        id: order._id.toString(),
        to: Q2C_STATUS.LEAD,
      });

      expect(res.q2cStatus).toBe(Q2C_STATUS.LEAD);
      const updated = await SaleOrder.findById(order._id);
      expect(updated?.q2cStatus).toBe(Q2C_STATUS.LEAD);
      expect(updated?.status).toBe(DOCUMENT_STATUS.DRAFT);
    });
  });

  // ---------------------------------------------------------------------------
  // S5 & S6: Customer receivables and automatic overdue detection
  // ---------------------------------------------------------------------------
  describe("S5 & S6: Customer receivables & overdue projection", () => {
    it("correctly identifies overdue invoices using deterministic clock", () => {
      const now = new Date("2026-10-23T12:00:00Z");
      const pastDue = new Date("2026-10-20T12:00:00Z");
      const futureDue = new Date("2026-10-30T12:00:00Z");

      // Unpaid and past due -> OVERDUE
      expect(
        resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 1000, payments: [], dueDate: pastDue }, now),
      ).toBe("overdue");

      // Partially paid and past due -> OVERDUE for remainder
      expect(
        resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 1000, payments: [{ amount: 300 }], dueDate: pastDue }, now),
      ).toBe("overdue");

      // Partially paid and not yet due -> PARTIALLY_PAID
      expect(
        resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 1000, payments: [{ amount: 300 }], dueDate: futureDue }, now),
      ).toBe("partially_paid");

      // Fully paid -> PAID even if due date passed
      expect(
        resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 1000, payments: [{ amount: 1000 }], dueDate: pastDue }, now),
      ).toBe("paid");

      // Cancelled -> CANCELLED even if past due
      expect(
        resolveInvoiceStatus({ requestedStatus: "cancelled", totalAmount: 1000, payments: [], dueDate: pastDue }, now),
      ).toBe("cancelled");
    });
  });
});
