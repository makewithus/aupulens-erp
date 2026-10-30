import CrmCase from "@/models/crm/Case";

export async function getCaseMetrics(tenantId: string) {
  const now = new Date();
  const [openCases, breachedCases, resolutionMetrics, satisfactionMetrics] = await Promise.all([
    CrmCase.countDocuments({ tenantId, status: { $nin: ['Resolved', 'Closed'] } }),
    CrmCase.countDocuments({ tenantId, status: { $nin: ['Resolved', 'Closed'] }, sla_target_at: { $lt: now } }),
    CrmCase.aggregate([
      { $match: {
          tenantId,
          status: { $in: ['Resolved', 'Closed'] },
          resolvedAt: { $type: 'date' },
          createdAt: { $type: 'date' },
          $expr: { $gte: ['$resolvedAt', '$createdAt'] },
        } },
      { $group: {
          _id: null,
          avgResolutionTime: { $avg: { $subtract: ['$resolvedAt', '$createdAt'] } }
        }
      }
    ]),
    CrmCase.aggregate([
      { $match: { tenantId, satisfaction_score: { $gte: 1, $lte: 5 } } },
      { $group: { _id: null, avgSatisfaction: { $avg: '$satisfaction_score' } } },
    ])
  ]);
  
  return {
    openCases,
    breachedCases,
    avgSatisfaction: satisfactionMetrics[0]?.avgSatisfaction ?? null,
    avgResolutionTimeMs: resolutionMetrics[0]?.avgResolutionTime ?? null
  };
}
