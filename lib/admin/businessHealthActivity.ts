/** Shared by scheduled analysis and its dashboard snapshot. */
export function hasBusinessHealthActivity(metrics: any, openOppsCount = 0): boolean {
  const finance = metrics?.finance;
  const sales = metrics?.sales;
  return [finance?.totalRevenue, finance?.totalExpenses, finance?.totalTransactions,
    sales?.totalOrders, sales?.totalRevenue, metrics?.totalPipeline, openOppsCount]
    .some((value) => typeof value === "number" && value !== 0);
}
