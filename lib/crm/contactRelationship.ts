export function calculateContactRelationshipScore(activities: any[] = [], opportunities: any[] = []): { score: number; label: string; color: string } {
  let score = 0;
  
  // Activity frequency and recency
  if (activities.length > 0) {
    score += Math.min(activities.length * 2, 40); // Max 40 points for volume
    
    // Recency bonus
    const latestActivityDate = new Date(Math.max(...activities.map(a => new Date(a.createdAt).getTime())));
    const daysSinceLastActivity = (new Date().getTime() - latestActivityDate.getTime()) / (1000 * 3600 * 24);
    
    if (daysSinceLastActivity <= 7) score += 20;
    else if (daysSinceLastActivity <= 30) score += 10;
  }
  
  // Opportunity involvement
  if (opportunities.length > 0) {
    score += Math.min(opportunities.length * 15, 30); // Max 30 points for opps
    
    // Active pipeline bonus
    const openOpps = opportunities.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage));
    if (openOpps.length > 0) score += 10;
  }
  
  // Ensure max score is 100
  score = Math.min(score, 100);

  let label = "Weak";
  let color = "bg-neutral-600";
  
  if (score >= 80) {
    label = "Strategic";
    color = "bg-purple-600";
  } else if (score >= 50) {
    label = "Strong";
    color = "bg-green-600";
  } else if (score >= 20) {
    label = "Moderate";
    color = "bg-blue-600";
  }

  return { score, label, color };
}
