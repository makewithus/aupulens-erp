export function calculateGlobalDataHealth(issues: any[], totalRecords: number) {
  if (totalRecords === 0) return 100;

  const duplicateRate = issues.filter(i => i.type === "Duplicate").length / totalRecords;
  const missingFieldsRate = issues.filter(i => i.type === "Missing Field").length / totalRecords;
  const staleRate = issues.filter(i => i.type === "Stale Record").length / totalRecords;
  const orphanRate = issues.filter(i => i.type === "Orphan Record").length / totalRecords;

  // Weighted penalty deduction from 100
  let score = 100;
  score -= (duplicateRate * 100) * 1.5; // High penalty for dupes
  score -= (missingFieldsRate * 100) * 0.8;
  score -= (staleRate * 100) * 0.5;
  score -= (orphanRate * 100) * 1.0;

  return {
    score: Math.max(0, Math.round(score)),
    duplicateRate: Math.round(duplicateRate * 100),
    missingFieldsRate: Math.round(missingFieldsRate * 100),
    staleRate: Math.round(staleRate * 100),
    orphanRate: Math.round(orphanRate * 100)
  };
}
