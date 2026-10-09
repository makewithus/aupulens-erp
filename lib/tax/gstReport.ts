export interface GstReportLine {
  hsn: string;
  gstRate: number;
  gstTreatment: string;
  taxableValue: number;
  taxAmount: number;
  total: number;
  missingHsnCount: number;
  lineCount: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildGstReport(invoices: any[]): GstReportLine[] {
  const rows = new Map<string, GstReportLine>();
  for (const invoice of invoices) {
    for (const line of invoice.lineItems || []) {
      const hsn = String(line.hsn || "").trim() || "-";
      const gstRate = Number(line.taxRate) || 0;
      const gstTreatment = String(line.gstTreatment || "taxable");
      const taxableValue = Number(line.taxableValue ?? (Number(line.qty || 0) * Number(line.unitPrice || 0))) || 0;
      const taxAmount = Number(line.taxAmount) || round2((taxableValue * gstRate) / 100);
      const total = Number(line.lineTotal) || round2(taxableValue + taxAmount);
      const key = `${hsn}|${gstRate}|${gstTreatment}`;
      const row = rows.get(key) || {
        hsn,
        gstRate,
        gstTreatment,
        taxableValue: 0,
        taxAmount: 0,
        total: 0,
        missingHsnCount: 0,
        lineCount: 0,
      };
      row.taxableValue += taxableValue;
      row.taxAmount += taxAmount;
      row.total += total;
      row.missingHsnCount += hsn === "-" ? 1 : 0;
      row.lineCount += 1;
      rows.set(key, row);
    }
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      taxableValue: round2(row.taxableValue),
      taxAmount: round2(row.taxAmount),
      total: round2(row.total),
    }))
    .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.gstRate - b.gstRate);
}
