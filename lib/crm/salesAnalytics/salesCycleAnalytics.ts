export function calculateSalesCycle(opportunities: any[]) {
  const wonOpps = opportunities.filter(o => o.stage === "Closed Won");
  if (wonOpps.length === 0) return { averageCycle: 0, byIndustry: {}, bySource: {} };

  let totalDays = 0;
  const byIndustry: any = {};
  const bySource: any = {};

  for (const opp of wonOpps) {
    const start = new Date(opp.createdAt).getTime();
    const end = new Date(opp.close_date || Date.now()).getTime();
    const days = Math.max(1, (end - start) / 86400000);

    totalDays += days;

    // Mock lookups assuming industry/source were populated or mapped
    const ind = opp.industry || "Unknown";
    const src = opp.source || "Unknown";

    if (!byIndustry[ind]) byIndustry[ind] = { count: 0, totalDays: 0 };
    byIndustry[ind].count++;
    byIndustry[ind].totalDays += days;

    if (!bySource[src]) bySource[src] = { count: 0, totalDays: 0 };
    bySource[src].count++;
    bySource[src].totalDays += days;
  }

  return {
    averageCycle: Math.round(totalDays / wonOpps.length),
    byIndustry: Object.keys(byIndustry).map(k => ({ industry: k, avgDays: Math.round(byIndustry[k].totalDays / byIndustry[k].count) })),
    bySource: Object.keys(bySource).map(k => ({ source: k, avgDays: Math.round(bySource[k].totalDays / bySource[k].count) })),
  };
}
