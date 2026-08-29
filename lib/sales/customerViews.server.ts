import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import { buildMongoFilterFromCriteria } from "@/lib/sales/customerViews";

export { buildMongoFilterFromCriteria };

// Returns a Mongo filter fragment ({ _id: { $in: [...] } }) for the two filters
// that need a cross-collection SalesInvoice lookup, since Customer alone
// doesn't know its own receivables/overdue state. Server-only: imports the
// SalesInvoice Mongoose model, which must never reach the client bundle.
export async function resolveSpecialFilter(
  specialFilter: string,
  tenantId: string,
  CustomerModel: any,
): Promise<Record<string, any>> {
  if (specialFilter === "overdue") {
    const customerIds = await (SalesInvoice as any).distinct("customerId", {
      tenantId,
      status: SALES_INVOICE_STATUS.OVERDUE,
    });
    return { _id: { $in: customerIds } };
  }

  if (specialFilter === "unpaid") {
    const customerIds = await (SalesInvoice as any).distinct("customerId", {
      tenantId,
      status: {
        $in: [SALES_INVOICE_STATUS.SAVED, SALES_INVOICE_STATUS.PARTIALLY_PAID, SALES_INVOICE_STATUS.OVERDUE],
      },
    });
    return { _id: { $in: customerIds } };
  }

  if (specialFilter === "duplicate") {
    const dupes = await CustomerModel.aggregate([
      { $match: { tenantId } },
      {
        $group: {
          _id: { $toLower: { $ifNull: ["$contact_details.email", "$header.displayName"] } },
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);
    const ids = dupes.flatMap((d: any) => d.ids);
    return { _id: { $in: ids } };
  }

  return {};
}
