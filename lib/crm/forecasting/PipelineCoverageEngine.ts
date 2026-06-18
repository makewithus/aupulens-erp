export function calculatePipelineCoverage(activeOpportunities: any[], quotaTarget: number) {
  let totalPipeline = 0;

  for (const opp of activeOpportunities) {
    if (opp.stage !== "Closed Won" && opp.stage !== "Closed Lost") {
      totalPipeline += opp.amount || 0;
    }
  }

  const coverageRatio = quotaTarget > 0 ? totalPipeline / quotaTarget : 0;
  
  return {
    totalPipeline,
    quotaTarget,
    coverageRatio: Math.round(coverageRatio * 100) / 100,
    isLowCoverage: coverageRatio < 3.0, // Standard 3x pipeline rule
    coverageRisk: coverageRatio < 2.0 ? "High" : coverageRatio < 3.0 ? "Medium" : "Low",
    revenueGap: quotaTarget > totalPipeline ? quotaTarget - totalPipeline : 0
  };
}
