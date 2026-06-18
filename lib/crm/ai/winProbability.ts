export function calculateWinProbability(opportunity: any, activities: any[]) {
  let prob = 20; // Base chance

  if (opportunity.stage === "Discovery") prob += 10;
  if (opportunity.stage === "Proposal") prob += 30;
  if (opportunity.stage === "Negotiation") prob += 50;

  // Activity Score
  if (activities.length > 10) prob += 10;
  else if (activities.length > 5) prob += 5;
  else if (activities.length === 0) prob -= 15;

  // Timeline Adherence
  if (opportunity.close_date) {
    const timeToClose = (new Date(opportunity.close_date).getTime() - Date.now()) / 86400000;
    if (timeToClose < 0) {
      prob -= 20; // Passed close date
    } else if (timeToClose < 14) {
      prob += 10; // Approaching close date and still active
    }
  }

  // Stakeholder Score / Decision Maker (Mock)
  if (opportunity.amount > 50000 && activities.length < 3) {
    prob -= 25; // High deal size, low engagement
  }

  return Math.max(5, Math.min(prob, 99)); // Cap between 5% and 99% unless actually won/lost
}
