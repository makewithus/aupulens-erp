import { buildMongoFilterFromCriteria } from "@/lib/sales/saleOrderViews";

export { buildMongoFilterFromCriteria };

// Server-only: date-window and compound (multi-field) specialFilters the
// generic criteria interpreter can't express. Mirrors customerViews.server.ts
// / subscriptionViews.server.ts's resolveSpecialFilter shape.
export async function resolveSpecialFilter(specialFilter: string): Promise<Record<string, any>> {
  const now = new Date();

  switch (specialFilter) {
    case "overdue":
      return {
        expectedShipmentDate: { $lt: now },
        shipmentStatus: { $ne: "fulfilled" },
      };
    case "to_be_shipped":
      return { salesOrderStatus: "confirmed", shipmentStatus: "not_shipped" };
    case "for_invoicing":
      return { shipmentStatus: "shipped", invoicingStatus: "not_invoiced" };
    case "shipped_not_invoiced":
      return { shipmentStatus: "shipped", invoicingStatus: "not_invoiced" };
    case "invoiced_not_shipped":
      return { invoicingStatus: "invoiced", shipmentStatus: { $in: ["not_shipped", "partially_shipped"] } };
    case "placeholder_empty":
      // Drop Shipped / Backorder / Manually Fulfilled — no dedicated tracking
      // field exists in this schema yet; an honest always-empty view rather
      // than faked data. See lib/sales/saleOrderViews.ts's comment.
      return { _id: { $in: [] } };
    default:
      return {};
  }
}
