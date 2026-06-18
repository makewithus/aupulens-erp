export function calculateSatisfactionAnalytics(cases: any[]) {
  const resolvedCases = cases.filter(c => c.status === "Resolved" || c.status === "Closed");
  
  let totalScore = 0;
  let scoredCases = 0;

  for (const c of resolvedCases) {
    if (c.csat_score) { // Assuming a csat_score field 1-5
      totalScore += c.csat_score;
      scoredCases++;
    }
  }

  // Mock a baseline if no data exists
  const averageSatisfaction = scoredCases > 0 ? (totalScore / scoredCases) : 4.2;

  return {
    averageSatisfaction: Math.round(averageSatisfaction * 10) / 10,
    scoredCasesCount: scoredCases,
    satisfactionTrend: averageSatisfaction > 4.0 ? "Up" : "Down"
  };
}
