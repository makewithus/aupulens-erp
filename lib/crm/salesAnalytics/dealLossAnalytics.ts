export function calculateDealLossAnalytics(opportunities: any[]) {
  const lostOpps = opportunities.filter(o => o.stage === "Closed Lost");
  
  let totalLostRevenue = 0;
  const lossReasons: any = {};
  const competitorLosses: any = {};

  for (const opp of lostOpps) {
    totalLostRevenue += opp.amount || 0;
    
    // Assume a custom field for loss_reason and competitor exist on the model
    const reason = opp.loss_reason || "Price";
    const competitor = opp.competitor || "None";

    if (!lossReasons[reason]) lossReasons[reason] = 0;
    lossReasons[reason]++;

    if (competitor !== "None") {
      if (!competitorLosses[competitor]) competitorLosses[competitor] = 0;
      competitorLosses[competitor]++;
    }
  }

  return {
    totalLostRevenue,
    lostDealsCount: lostOpps.length,
    lossReasons: Object.keys(lossReasons).map(k => ({ reason: k, count: lossReasons[k] })),
    competitorLosses: Object.keys(competitorLosses).map(k => ({ competitor: k, count: competitorLosses[k] }))
  };
}
