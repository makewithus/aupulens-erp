export function calculateForecast(opportunities: any[]) {
  let totalPipeline = 0;
  let weightedPipeline = 0;
  let closedWon = 0;
  
  const monthlyForecast = Array(12).fill(0);
  const quarterlyForecast = Array(4).fill(0);

  opportunities.forEach(opp => {
    const amount = opp.amount || 0;
    const probability = opp.probability || 0;
    const weighted = amount * (probability / 100);
    
    // Update individual opp if needed
    opp.weighted_value = weighted;

    if (opp.stage === 'Closed Won') {
      closedWon += amount;
    } else if (opp.stage !== 'Closed Lost') {
      totalPipeline += amount;
      weightedPipeline += weighted;

      if (opp.expected_close_date) {
        const date = new Date(opp.expected_close_date);
        const month = date.getMonth(); // 0-11
        const quarter = Math.floor(month / 3); // 0-3
        
        monthlyForecast[month] += weighted;
        quarterlyForecast[quarter] += weighted;
      }
    }
  });

  return {
    totalPipeline,
    weightedPipeline,
    closedWon,
    monthlyForecast,
    quarterlyForecast,
    averageDealSize: opportunities.length > 0 ? (totalPipeline + closedWon) / opportunities.length : 0
  };
}
