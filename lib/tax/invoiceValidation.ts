import AccountingSettings from "@/models/finance/AccountingSettings";

export async function validateInvoiceTaxRequirements(tenantId: string, lineItems: any[]) {
  const settings = await AccountingSettings.findOne({ tenantId }).select("taxSettings.requireHsnSacOnInvoices").lean();
  if (!(settings as any)?.taxSettings?.requireHsnSacOnInvoices) return null;

  const missing = (lineItems || [])
    .map((line: any, index: number) => ({ index: index + 1, name: line.name || `Line ${index + 1}`, hsn: String(line.hsn || "").trim() }))
    .filter((line) => !line.hsn);

  if (missing.length === 0) return null;
  return `HSN/SAC is required for sales invoices by tax settings. Missing on: ${missing.map((line) => line.name).join(", ")}.`;
}
