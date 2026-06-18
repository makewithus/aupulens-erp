export function calculateCustomerHealth(params: {
  revenue: number;
  activityCount: number;
  avgSatisfaction: number; // 0 to 5
  openIssues: number;
  renewalsCount: number;
}): number {
  let score = 50; // Base score
  
  // Revenue modifier (small bump for high value)
  if (params.revenue > 10000) score += 5;
  if (params.revenue > 50000) score += 5;
  
  // Activity modifier
  if (params.activityCount > 5) score += 10;
  else if (params.activityCount === 0) score -= 10;
  
  // Satisfaction modifier
  if (params.avgSatisfaction >= 4) score += 15;
  else if (params.avgSatisfaction > 0 && params.avgSatisfaction < 3) score -= 20;
  
  // Issues penalty
  if (params.openIssues > 2) score -= 15;
  if (params.openIssues > 5) score -= 15;
  
  // Renewals bonus
  if (params.renewalsCount > 0) score += 10;
  if (params.renewalsCount > 2) score += 10;
  
  // Bound score
  return Math.max(0, Math.min(100, score));
}
