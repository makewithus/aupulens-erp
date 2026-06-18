import dbConnect from "@/lib/db";
import CrmCampaign from "@/models/crm/Campaign";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";
import { getCampaignRevenue } from "./attributionEngine";

export interface RoiMetrics {
  totalLeads: number;
  qualifiedLeads: number;
  totalOpportunities: number;
  closedWonOpportunities: number;
  attributedRevenue: number;
  budget: number;
  costPerLead: number;
  costPerOpportunity: number;
  conversionRate: number;
  roiPercentage: number;
}

export async function calculateCampaignROI(campaignId: string, tenantId: string): Promise<RoiMetrics> {
  await dbConnect();
  
  const campaign = await CrmCampaign.findOne({ _id: campaignId, tenantId }).lean();
  if (!campaign) throw new Error("Campaign not found");

  const budget = (campaign as any).budget || 0;

  const [
    totalLeads, 
    qualifiedLeads, 
    totalOpportunities, 
    closedWonOpportunities,
    attributedRevenue
  ] = await Promise.all([
    CrmLead.countDocuments({ campaign_id: campaignId, tenantId }),
    CrmLead.countDocuments({ campaign_id: campaignId, tenantId, status: { $in: ["Qualified", "Converted"] } }),
    CrmOpportunity.countDocuments({ campaign_id: campaignId, tenantId }),
    CrmOpportunity.countDocuments({ campaign_id: campaignId, tenantId, stage: "Closed Won" }),
    getCampaignRevenue(campaignId, tenantId)
  ]);

  const costPerLead = totalLeads > 0 ? budget / totalLeads : 0;
  const costPerOpportunity = totalOpportunities > 0 ? budget / totalOpportunities : 0;
  const conversionRate = totalLeads > 0 ? (closedWonOpportunities / totalLeads) * 100 : 0;
  
  // ROI = ((Attributed Revenue - Budget) / Budget) * 100
  const roiPercentage = budget > 0 
    ? ((attributedRevenue - budget) / budget) * 100 
    : attributedRevenue > 0 ? 100 : 0; // If no budget but revenue exists, ROI is technically infinite, but we'll cap at 100% or standard for display

  return {
    totalLeads,
    qualifiedLeads,
    totalOpportunities,
    closedWonOpportunities,
    attributedRevenue,
    budget,
    costPerLead,
    costPerOpportunity,
    conversionRate,
    roiPercentage
  };
}

export async function updateCampaignROI(campaignId: string, tenantId: string) {
  const metrics = await calculateCampaignROI(campaignId, tenantId);
  await CrmCampaign.updateOne(
    { _id: campaignId, tenantId },
    { 
      $set: { 
        actual_revenue: metrics.attributedRevenue,
        attributed_revenue: metrics.attributedRevenue,
        roi_percentage: metrics.roiPercentage
      } 
    }
  );
  return metrics;
}

export async function calculateGlobalROI(tenantId: string) {
  await dbConnect();

  const campaigns = await CrmCampaign.find({ tenantId }).lean();
  const totalBudget = campaigns.reduce((acc, c) => acc + ((c as any).budget || 0), 0);
  
  const [totalLeads, totalOpps, closedWon, totalRevenueAggr] = await Promise.all([
    CrmLead.countDocuments({ tenantId, campaign_id: { $exists: true, $ne: null } }),
    CrmOpportunity.countDocuments({ tenantId, campaign_id: { $exists: true, $ne: null } }),
    CrmOpportunity.countDocuments({ tenantId, campaign_id: { $exists: true, $ne: null }, stage: "Closed Won" }),
    getGlobalCampaignRevenue(tenantId)
  ]);

  const roiPercentage = totalBudget > 0 
    ? ((totalRevenueAggr - totalBudget) / totalBudget) * 100 
    : 0;

  return {
    totalBudget,
    totalRevenue: totalRevenueAggr,
    totalLeads,
    totalOpps,
    closedWon,
    roiPercentage
  };
}

// Helper to get total attributed revenue globally
async function getGlobalCampaignRevenue(tenantId: string) {
  const { default: CrmContract } = await import("@/models/crm/Contract");
  const contracts = await CrmContract.find({ 
    tenantId, 
    campaign_id: { $exists: true, $ne: null },
    status: { $in: ["Active", "Renewal Due", "Expiring", "Renewed"] }
  }).lean();
  return contracts.reduce((acc, c) => acc + ((c as any).contract_value || 0), 0);
}
