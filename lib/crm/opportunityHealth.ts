import { IOpportunity } from "@/models/crm/Opportunity";

export type RiskLevel = "Healthy" | "Warning" | "At Risk" | "Critical";

export interface HealthStatus {
  level: RiskLevel;
  flags: string[];
}

export function evaluateOpportunityHealth(
  opp: IOpportunity,
  lastActivityDate?: Date | null,
  closeDateChangesCount: number = 0,
  engagementScore: number = 50 // 0-100
): HealthStatus {
  const flags: string[] = [];
  const now = new Date();
  
  // 1. No activity for 14+ days
  if (lastActivityDate) {
    const daysSinceActivity = (now.getTime() - lastActivityDate.getTime()) / (1000 * 3600 * 24);
    if (daysSinceActivity > 14) {
      flags.push(`No activity for ${Math.round(daysSinceActivity)} days`);
    } else if (daysSinceActivity > 7) {
      flags.push(`No activity for ${Math.round(daysSinceActivity)} days`);
    }
  } else {
    flags.push("No recorded activities");
  }

  // 2. Stage stuck too long (Using stage_entered_at)
  if (opp.stage_entered_at) {
    const daysInStage = (now.getTime() - new Date(opp.stage_entered_at).getTime()) / (1000 * 3600 * 24);
    
    // Different stages have different acceptable durations
    const maxDaysMap: Record<string, number> = {
      'Prospecting': 14,
      'Discovery': 14,
      'Requirement Gathering': 21,
      'Solution Fit': 14,
      'Proposal Sent': 7,
      'Negotiation': 14,
      'Approval': 7
    };
    
    const maxDays = maxDaysMap[opp.stage] || 30;
    if (daysInStage > maxDays) {
      flags.push(`Stuck in ${opp.stage} for ${Math.round(daysInStage)} days (Expected: <${maxDays})`);
    }
  }

  // 3. Close date moved repeatedly
  if (closeDateChangesCount >= 3) {
    flags.push(`Close date pushed ${closeDateChangesCount} times`);
  } else if (closeDateChangesCount === 2) {
    flags.push(`Close date pushed ${closeDateChangesCount} times`);
  }

  // 4. Missing decision maker
  const hasDecisionMaker = opp.stakeholders?.some(s => s.role === 'Decision Maker' || s.role === 'Economic Buyer');
  if (!hasDecisionMaker && opp.stage !== 'Prospecting' && opp.stage !== 'Discovery') {
    flags.push("No Decision Maker identified");
  }

  // 5. Proposal sent but no response (Simulated by stage + inactivity)
  if (opp.stage === 'Proposal Sent' && lastActivityDate) {
    const daysSinceActivity = (now.getTime() - lastActivityDate.getTime()) / (1000 * 3600 * 24);
    if (daysSinceActivity > 5) {
      flags.push("Proposal sent but no recent engagement");
    }
  }

  // 6. High value with low engagement
  // Assuming 'high value' is > $50,000 for this context
  if (opp.amount > 50000 && engagementScore < 30) {
    flags.push("High value deal with critically low engagement");
  }

  // 7. Expected close date is in the past
  if (opp.expected_close_date && new Date(opp.expected_close_date) < now && !['Closed Won', 'Closed Lost'].includes(opp.stage)) {
    flags.push("Expected close date has passed");
  }

  // Determine Overall Risk Level based on flags weight
  let level: RiskLevel = "Healthy";
  let riskScore = 0;

  for (const flag of flags) {
    if (flag.includes("No activity for 14+")) riskScore += 3;
    else if (flag.includes("No recorded activities")) riskScore += 2;
    else if (flag.includes("Stuck in")) riskScore += 2;
    else if (flag.includes("Close date pushed 3")) riskScore += 3;
    else if (flag.includes("Close date pushed 2")) riskScore += 1;
    else if (flag.includes("No Decision Maker")) riskScore += 2;
    else if (flag.includes("Proposal sent but no recent")) riskScore += 3;
    else if (flag.includes("High value deal with critically")) riskScore += 4;
    else if (flag.includes("Expected close date has passed")) riskScore += 3;
    else riskScore += 1;
  }

  if (riskScore >= 6) {
    level = "Critical";
  } else if (riskScore >= 4) {
    level = "At Risk";
  } else if (riskScore >= 2) {
    level = "Warning";
  }

  // Exempt closed deals
  if (['Closed Won', 'Closed Lost'].includes(opp.stage)) {
    level = "Healthy";
    flags.length = 0; // Clear flags for closed deals
  }

  return { level, flags };
}
