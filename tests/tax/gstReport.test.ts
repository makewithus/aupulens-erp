import { describe, expect, it } from "vitest";
import { buildGstReport } from "@/lib/tax/gstReport";

describe("GST report aggregation", () => {
  it("groups sales by HSN, GST rate, and treatment and detects missing HSN", () => {
    const rows = buildGstReport([
      {
        lineItems: [
          { hsn: "4820", taxRate: 18, gstTreatment: "taxable", taxableValue: 950, taxAmount: 171, lineTotal: 1121 },
          { hsn: "4820", taxRate: 18, gstTreatment: "taxable", taxableValue: 50, taxAmount: 9, lineTotal: 59 },
          { hsn: "", taxRate: 0, gstTreatment: "exempt", taxableValue: 100, taxAmount: 0, lineTotal: 100 },
        ],
      },
    ]);

    const notebook = rows.find((row) => row.hsn === "4820")!;
    expect(notebook.taxableValue).toBe(1000);
    expect(notebook.taxAmount).toBe(180);
    expect(notebook.lineCount).toBe(2);

    const missing = rows.find((row) => row.hsn === "-")!;
    expect(missing.gstTreatment).toBe("exempt");
    expect(missing.missingHsnCount).toBe(1);
  });
});
