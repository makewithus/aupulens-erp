export function calculateSlaTarget(severity: string): Date {
  const target = new Date();
  if (severity === 'Critical') target.setHours(target.getHours() + 4);
  else if (severity === 'High') target.setHours(target.getHours() + 8);
  else if (severity === 'Medium') target.setHours(target.getHours() + 24);
  else target.setHours(target.getHours() + 72); // Low
  return target;
}

export function computeSlaAnalytics(cases: any[]) {
  let breachedCount = 0;
  let escalationCount = 0;
  let totalResolutionTime = 0;
  let resolvedCount = 0;

  cases.forEach(c => {
    if (c.sla_breached) breachedCount++;
    if (c.escalation_level > 0) escalationCount++;
    if (['Resolved', 'Closed'].includes(c.status) && c.createdAt && c.updatedAt) {
      resolvedCount++;
      totalResolutionTime += (new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime());
    }
  });

  const total = cases.length || 1;
  return {
    compliancePercentage: ((total - breachedCount) / total) * 100,
    breachPercentage: (breachedCount / total) * 100,
    escalationPercentage: (escalationCount / total) * 100,
    avgResolutionTimeMs: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0
  };
}
