export function calculateRevenueForecast(opportunities: any[]) {
  let bestCase = 0;
  let likelyCase = 0;
  let worstCase = 0;
  let weightedForecast = 0;
  let pipelineForecast = 0;
  let closedRevenue = 0;
  let futureRevenue = 0;

  for (const opp of opportunities) {
    const amount = opp.amount || 0;
    
    if (opp.stage === "Closed Won") {
      closedRevenue += amount;
      bestCase += amount;
      likelyCase += amount;
      worstCase += amount;
      weightedForecast += amount;
      pipelineForecast += amount;
      continue;
    }

    if (opp.stage === "Closed Lost") continue;

    // Active Opportunities
    futureRevenue += amount;
    pipelineForecast += amount;

    // AI Win Probability or Static Fallback
    const prob = opp.win_probability || (
      opp.stage === "Discovery" ? 10 :
      opp.stage === "Proposal" ? 30 :
      opp.stage === "Negotiation" ? 60 : 0
    );

    weightedForecast += amount * (prob / 100);

    if (prob > 20) bestCase += amount;
    if (prob > 50) likelyCase += amount;
    if (prob > 80) worstCase += amount; // Confident deals
  }

  return {
    bestCase,
    likelyCase,
    worstCase,
    weightedForecast,
    pipelineForecast,
    closedRevenue,
    futureRevenue
  };
}
