export function predictChurn(account: any, cases: any[], contracts: any[]) {
  let riskScore = 0;
  const factors: string[] = [];

  // Health Score (Assuming it exists on Account, else default 100)
  const healthScore = account.health_score || 80;
  if (healthScore < 50) {
    riskScore += 40;
    factors.push("Low health score");
  } else if (healthScore < 70) {
    riskScore += 20;
    factors.push("Degrading health score");
  }

  // Case Volume (mock threshold > 5 open cases)
  const openCases = cases.filter(c => c.status !== "Closed");
  if (openCases.length > 5) {
    riskScore += 30;
    factors.push(`High active case volume (${openCases.length} open)`);
  }

  // SLA Breaches in cases
  const slaBreached = cases.filter(c => c.priority === "High" && c.status === "Open" /* Mock check */).length;
  if (slaBreached > 0) {
    riskScore += 20;
    factors.push(`Unresolved high priority cases`);
  }

  // Expiring contracts
  const expiring = contracts.filter(c => c.status === "Active" && (new Date(c.end_date).getTime() - Date.now()) < 30 * 86400000);
  if (expiring.length > 0) {
    riskScore += 25;
    factors.push("Contract expiring within 30 days");
  }

  let severity: "Low" | "Medium" | "High" | "Critical" = "Low";
  if (riskScore >= 80) severity = "Critical";
  else if (riskScore >= 60) severity = "High";
  else if (riskScore >= 40) severity = "Medium";

  return {
    severity,
    factors,
    confidence: 88
  };
}
