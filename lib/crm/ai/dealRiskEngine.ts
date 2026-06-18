export function detectDealRisk(opportunity: any, daysSinceLastActivity: number) {
  let riskScore = 0;
  const flags: string[] = [];

  if (daysSinceLastActivity > 14) {
    riskScore += 40;
    flags.push("No activity > 14 days");
  }

  const daysInStage = opportunity.stage_entered_at 
    ? (Date.now() - new Date(opportunity.stage_entered_at).getTime()) / (1000 * 3600 * 24)
    : 0;
    
  if (daysInStage > 21 && opportunity.stage !== "Closed Won" && opportunity.stage !== "Closed Lost") {
    riskScore += 30;
    flags.push(`Stage stuck > 21 days (${Math.floor(daysInStage)} days)`);
  }

  // High value + low engagement
  if (opportunity.amount > 50000 && daysSinceLastActivity > 7) {
    riskScore += 30;
    flags.push("High value deal with recent low engagement");
  }

  let severity: "Low" | "Medium" | "High" | "Critical" = "Low";
  if (riskScore >= 80) severity = "Critical";
  else if (riskScore >= 50) severity = "High";
  else if (riskScore >= 30) severity = "Medium";

  return {
    severity,
    flags,
    riskScore: Math.min(riskScore, 100),
    confidence: 85
  };
}
