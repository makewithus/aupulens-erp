import { describe, expect, it, vi } from "vitest";

const findOne = vi.fn();

vi.mock("@/models/finance/AccountingSettings", () => ({
  default: { findOne },
}));

describe("invoice HSN/SAC requirement validation", () => {
  it("allows missing HSN when the tenant setting is disabled", async () => {
    findOne.mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve({ taxSettings: { requireHsnSacOnInvoices: false } }) }) });
    const { validateInvoiceTaxRequirements } = await import("@/lib/tax/invoiceValidation");
    await expect(validateInvoiceTaxRequirements("t1", [{ name: "Legacy", taxRate: 18 }])).resolves.toBeNull();
  });

  it("blocks missing HSN when the tenant setting is enabled", async () => {
    findOne.mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve({ taxSettings: { requireHsnSacOnInvoices: true } }) }) });
    const { validateInvoiceTaxRequirements } = await import("@/lib/tax/invoiceValidation");
    const error = await validateInvoiceTaxRequirements("t1", [{ name: "Taxable line", taxRate: 18, hsn: "" }]);
    expect(error).toContain("HSN/SAC is required");
    expect(error).toContain("Taxable line");
  });
});
