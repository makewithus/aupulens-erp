/**
 * Strips empty-string values from optional ObjectId ref fields on a Product
 * payload before it reaches Mongoose. The Income/Expense Account and
 * pricelist-item pickers (SelectSearchAdd) submit "" for "nothing
 * selected" rather than omitting the key — Mongoose's ObjectId caster
 * rejects "" with a CastError, and CastError (unlike ValidationError) is
 * NOT raised during findOneAndUpdate's schema validation pass, so it was
 * escaping the routes' `error.name === "ValidationError"` handling and
 * surfacing as a raw 500 (Issue #5) whenever a product was saved without
 * picking an account. These fields are legitimately optional, so the fix is
 * to treat "" as "not set" rather than to force a selection.
 */
export function sanitizeProductPayload(body: any) {
  if (body?.tab_accounting?.cost_and_revenue) {
    const car = body.tab_accounting.cost_and_revenue;
    if (car.property_account_income_id === "") delete car.property_account_income_id;
    if (car.property_account_expense_id === "") delete car.property_account_expense_id;
  }
  if (Array.isArray(body?.tab_prices?.pricelist_item_ids)) {
    for (const item of body.tab_prices.pricelist_item_ids) {
      if (item.pricelist_id === "") delete item.pricelist_id;
    }
  }
  return body;
}

export const ACCOUNTING_ARTIFACT_NAME_REGEX =
  /^(payment received|customer payment|vendor payment|advance payment|payment receipt|receipt voucher|journal entry|contra voucher|(?:payment|receipt)\s+against)\b/i;
export const ACCOUNTING_ARTIFACT_CODE_REGEX = /^(PAY|REC|RCPT|PMT|JE|JV)-/i;

/**
 * Checks whether a product record is a confirmed non-product accounting artifact
 * (such as a payment or receipt imported as a product).
 * Preserves legitimate products (even if priced at ₹1).
 */
export function isAccountingArtifact(product: any): boolean {
  if (!product) return false;
  const name = String(product.header?.name || product.name || "").trim();
  const code = String(product.tab_general_information?.default_code || product.sku || "").trim();

  const nameMatches = ACCOUNTING_ARTIFACT_NAME_REGEX.test(name);
  const codeMatches = ACCOUNTING_ARTIFACT_CODE_REGEX.test(code);

  return nameMatches || codeMatches;
}

/**
 * Safe, dry-run diagnostic utility to inspect a product catalog without mutating records.
 */
export function dryRunAuditProductArtifacts(products: any[]) {
  const artifacts: any[] = [];
  const legitimateProducts: any[] = [];

  for (const p of products) {
    if (isAccountingArtifact(p)) {
      artifacts.push({
        id: p._id,
        name: p.header?.name || p.name,
        code: p.tab_general_information?.default_code || p.sku,
        price: p.tab_general_information?.list_price || p.price,
        reason: "Matches accounting transaction pattern rather than catalog product",
      });
    } else {
      legitimateProducts.push(p);
    }
  }

  return {
    totalScanned: products.length,
    artifactCount: artifacts.length,
    legitimateCount: legitimateProducts.length,
    artifacts,
  };
}
