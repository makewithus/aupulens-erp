export interface PurchaseTaxComparison {
  status: "matched" | "mismatch" | "not_applicable";
  differences: string[];
  product?: {
    hsnSacCode?: string;
    gstRate?: number;
    gstTreatment?: string;
  };
  supplier?: {
    hsnSacCode?: string;
    gstRate?: number;
    gstTreatment?: string;
  };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function comparePurchaseLineTax(line: any, product: any): PurchaseTaxComparison {
  if (!product) return { status: "not_applicable", differences: [] };

  const productTax = product.tab_general_information || {};
  const productHsn = clean(productTax.hsnSacCode);
  const supplierHsn = clean(line.hsnSacCode ?? line.hsn ?? line.supplierHsnSacCode);
  const productRate = num(productTax.gstRate);
  const supplierRate = num(line.taxRate ?? line.gstRate ?? line.supplierGstRate);
  const productTreatment = clean(productTax.gstTreatment);
  const supplierTreatment = clean(line.gstTreatment ?? line.supplierGstTreatment);
  const differences: string[] = [];

  if ((productHsn || supplierHsn) && productHsn !== supplierHsn) differences.push("HSN/SAC");
  if (productRate !== undefined && supplierRate !== undefined && productRate !== supplierRate) differences.push("GST rate");
  if (productTreatment && supplierTreatment && productTreatment !== supplierTreatment) differences.push("GST treatment");

  return {
    status: differences.length ? "mismatch" : "matched",
    differences,
    product: {
      hsnSacCode: productHsn || undefined,
      gstRate: productRate,
      gstTreatment: productTreatment || undefined,
    },
    supplier: {
      hsnSacCode: supplierHsn || undefined,
      gstRate: supplierRate,
      gstTreatment: supplierTreatment || undefined,
    },
  };
}
