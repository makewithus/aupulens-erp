export function analyzeLeadScore(lead: any) {
  let score = 0;
  const reasons: string[] = [];

  // Industry fit
  if (lead.industry && ["Technology", "Finance", "Healthcare"].includes(lead.industry)) {
    score += 20;
    reasons.push("High-value industry fit");
  } else if (lead.industry) {
    score += 10;
    reasons.push("Industry identified");
  }

  // Budget
  if (lead.annual_revenue && lead.annual_revenue > 1000000) {
    score += 25;
    reasons.push("High revenue potential");
  } else if (lead.annual_revenue) {
    score += 15;
  }

  // Engagement (Mock heuristics based on status/activities)
  if (lead.status === "Qualified") {
    score += 30;
    reasons.push("Lead is pre-qualified");
  } else if (lead.status === "Attempting Contact") {
    score += 5;
  }

  // Source Quality
  if (lead.source === "Referral" || lead.source === "Organic Search") {
    score += 15;
    reasons.push("High-converting source channel");
  } else if (lead.source) {
    score += 5;
  }

  // Decision Maker
  if (lead.title && (lead.title.toLowerCase().includes("ceo") || lead.title.toLowerCase().includes("director") || lead.title.toLowerCase().includes("vp"))) {
    score += 20;
    reasons.push("Decision maker involved");
  }

  const normalizedScore = Math.min(score, 100);
  let action = "Continue standard nurture";
  if (normalizedScore > 80) action = "Assign to Senior Rep immediately";
  else if (normalizedScore > 50) action = "Schedule Discovery Call";

  return {
    score: normalizedScore,
    confidence: Math.floor(Math.random() * 20) + 75, // 75-95%
    explanation: reasons.join(". "),
    recommendedAction: action
  };
}
