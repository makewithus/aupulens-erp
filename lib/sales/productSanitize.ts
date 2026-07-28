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
