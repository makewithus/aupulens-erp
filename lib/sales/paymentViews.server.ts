import { buildMongoFilterFromCriteria } from "@/lib/sales/paymentViews";

export { buildMongoFilterFromCriteria };

// No specialFilters are needed for Payments' 4 seeded views today (all four
// are plain-criteria), but this file exists to mirror the saleOrderViews.ts/
// .server.ts split-file convention so a future date-window or cross-collection
// view can be added here without touching the client-safe file.
export async function resolveSpecialFilter(_specialFilter: string): Promise<Record<string, any>> {
  return {};
}
