import CrmContract from "@/models/crm/Contract";

export async function getContractMetrics(tenantId: string) {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [expiringContracts, renewalPipeline, statusSummary] = await Promise.all([
    CrmContract.countDocuments({ 
      tenantId, 
      status: { $in: ['Active', 'Expiring Soon'] },
      end_date: { $lte: thirtyDaysFromNow }
    }),
    CrmContract.aggregate([
      { $match: { tenantId, status: { $in: ['Active', 'Expiring Soon'] }, end_date: { $lte: thirtyDaysFromNow } } },
      { $group: { _id: null, totalValue: { $sum: '$contract_value' } } }
    ]),
    CrmContract.aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);

  const totalRenewed = statusSummary.find((s: any) => s._id === 'Renewed')?.count || 0;
  const totalTerminated = statusSummary.find((s: any) => s._id === 'Terminated')?.count || 0;
  const renewalSuccessRate = (totalRenewed + totalTerminated) > 0 
    ? Math.round((totalRenewed / (totalRenewed + totalTerminated)) * 100) 
    : 0;

  return {
    expiringContracts,
    renewalPipelineValue: renewalPipeline[0]?.totalValue || 0,
    renewalSuccessRate
  };
}
