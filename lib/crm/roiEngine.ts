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

  const budget = Number((campaign as any).budget) || 0;

  const [
    totalLeads, 
    qualifiedLeads, 
    totalOpportunities, 
    closedWonOpportunities,
    contractRevenue
  ] = await Promise.all([
    CrmLead.countDocuments({ campaign_id: campaignId, tenantId }),
    CrmLead.countDocuments({ campaign_id: campaignId, tenantId, status: { $in: ["Qualified", "Converted"] } }),
    CrmOpportunity.countDocuments({ campaign_id: campaignId, tenantId }),
    CrmOpportunity.countDocuments({ campaign_id: campaignId, tenantId, stage: "Closed Won" }),
    getCampaignRevenue(campaignId, tenantId)
  ]);

  // Prefer current contract attribution. Older/imported campaigns may have
  // revenue recorded on the campaign itself without a campaign_id link on the
  // contract, so fall back to the saved campaign revenue when no linked
  // contract revenue exists. Campaign detail and global ROI share this path.
  const storedRevenue = Math.max(
    Number((campaign as any).attributed_revenue) || 0,
    Number((campaign as any).actual_revenue) || 0,
  );
  const attributedRevenue = contractRevenue || storedRevenue;

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
  // Sum the same per-campaign attribution result shown on each campaign page.
  // This keeps the global card reconcilable with individual campaigns and
  // avoids a second, subtly different contract-only attribution query.
  const campaignMetrics = await Promise.all(
    campaigns.map((campaign) => calculateCampaignROI(String(campaign._id), tenantId)),
  );
  const totalBudget = campaignMetrics.reduce((sum, metrics) => sum + metrics.budget, 0);
  const totalLeads = campaignMetrics.reduce((sum, metrics) => sum + metrics.totalLeads, 0);
  const totalOpps = campaignMetrics.reduce((sum, metrics) => sum + metrics.totalOpportunities, 0);
  const closedWon = campaignMetrics.reduce((sum, metrics) => sum + metrics.closedWonOpportunities, 0);
  const totalRevenueAggr = campaignMetrics.reduce((sum, metrics) => sum + metrics.attributedRevenue, 0);

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
