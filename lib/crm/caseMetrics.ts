import CrmCase from "@/models/crm/Case";

export async function getCaseMetrics(tenantId: string) {
  const [openCases, breachedCases, metrics] = await Promise.all([
    CrmCase.countDocuments({ tenantId, status: { $nin: ['Resolved', 'Closed'] } }),
    CrmCase.countDocuments({ tenantId, sla_breached: true, status: { $nin: ['Resolved', 'Closed'] } }),
    CrmCase.aggregate([
      { $match: { tenantId, status: { $in: ['Resolved', 'Closed'] } } },
      { $group: {
          _id: null,
          avgSatisfaction: { $avg: '$satisfaction_score' },
          avgResolutionTime: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } }
        }
      }
    ])
  ]);
  
  return {
    openCases,
    breachedCases,
    avgSatisfaction: metrics[0]?.avgSatisfaction || 0,
    avgResolutionTimeMs: metrics[0]?.avgResolutionTime || 0
  };
}
