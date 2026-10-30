export function calculateSlaTarget(severity: string): Date {
  const target = new Date();
  if (severity === 'Critical') target.setHours(target.getHours() + 4);
  else if (severity === 'High') target.setHours(target.getHours() + 8);
  else if (severity === 'Medium') target.setHours(target.getHours() + 24);
  else target.setHours(target.getHours() + 72); // Low
  return target;
}

const TERMINAL_CASE_STATUSES = new Set(["Resolved", "Closed"]);

/** A case is currently in breach only while it is active and past its deadline. */
export function isSlaCurrentlyBreached(
  crmCase: { status?: string; sla_target_at?: Date | string | null },
  now = new Date(),
): boolean {
  if (!crmCase.sla_target_at || TERMINAL_CASE_STATUSES.has(crmCase.status || "")) return false;
  const target = new Date(crmCase.sla_target_at).getTime();
  return Number.isFinite(target) && target < now.getTime();
}

/** Return today's midnight for the ERP's displayed India business timezone. */
export function startOfIndiaBusinessDay(now = new Date()): Date {
  const indiaOffsetMs = 5.5 * 60 * 60 * 1000;
  const indiaNow = new Date(now.getTime() + indiaOffsetMs);
  return new Date(Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth(), indiaNow.getUTCDate()) - indiaOffsetMs);
}

export function computeSlaAnalytics(cases: any[]) {
  let breachedCount = 0;
  let escalationCount = 0;
  let totalResolutionTime = 0;
  let resolvedCount = 0;

  cases.forEach(c => {
    if (isSlaCurrentlyBreached(c)) breachedCount++;
    if (c.escalation_level > 0) escalationCount++;
    if (['Resolved', 'Closed'].includes(c.status) && c.createdAt && (c.resolvedAt || c.updatedAt)) {
      const elapsed = new Date(c.resolvedAt || c.updatedAt).getTime() - new Date(c.createdAt).getTime();
      if (Number.isFinite(elapsed) && elapsed >= 0) {
        resolvedCount++;
        totalResolutionTime += elapsed;
      }
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
