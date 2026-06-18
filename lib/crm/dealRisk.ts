export function calculateDealRisk(opportunity: any, activities: any[], openCases: any[]) {
  let riskScore = 0;
  let missingFactors = [];

  // 1. Missing key stakeholders
  if (!opportunity.stakeholders || !opportunity.stakeholders.some((s: any) => s.role === 'Decision Maker')) {
    riskScore += 30;
    missingFactors.push('Missing Decision Maker');
  }

  // 2. Inactivity (No activity in 14 days)
  const lastActivity = activities.length > 0 ? new Date(activities[0].activity_date) : new Date(opportunity.createdAt);
  const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 3600 * 24);
  if (daysSinceActivity > 14) {
    riskScore += 30;
    missingFactors.push(`Inactive for ${Math.round(daysSinceActivity)} days`);
  }

  // 3. Open Support Cases
  if (openCases.length > 0) {
    riskScore += 20 * openCases.length;
    missingFactors.push(`${openCases.length} open support cases`);
  }

  // 4. Stalled in Stage
  const daysInStage = (Date.now() - new Date(opportunity.stage_entered_at).getTime()) / (1000 * 3600 * 24);
  if (daysInStage > 30 && !['Closed Won', 'Closed Lost'].includes(opportunity.stage)) {
    riskScore += 20;
    missingFactors.push(`Stalled in ${opportunity.stage} for ${Math.round(daysInStage)} days`);
  }

  let risk_level = 'Low';
  if (riskScore >= 60) risk_level = 'High';
  else if (riskScore >= 30) risk_level = 'Medium';

  return { risk_level, riskScore, missingFactors };
}
