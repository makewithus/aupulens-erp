import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmContract from "@/models/crm/Contract";
import CrmCampaign from "@/models/crm/Campaign";
import mongoose from "mongoose";

// ─── Utilities ───────────────────────────────────────────────────────────────

export async function getAttributedLeads(campaignId: string, tenantId: string) {
  await dbConnect();
  return CrmLead.find({ campaign_id: campaignId, tenantId }).lean();
}

export async function getAttributedOpportunities(campaignId: string, tenantId: string) {
  await dbConnect();
  return CrmOpportunity.find({ campaign_id: campaignId, tenantId }).lean();
}

export async function getAttributedContracts(campaignId: string, tenantId: string) {
  await dbConnect();
  return CrmContract.find({ campaign_id: campaignId, tenantId }).lean();
}

// ─── Revenue & Conversion ───────────────────────────────────────────────────

export async function getCampaignRevenue(campaignId: string, tenantId: string) {
  await dbConnect();
  const contracts = await CrmContract.find({ 
    campaign_id: campaignId, 
    tenantId,
    status: { $in: ["Active", "Renewal Due", "Expiring", "Renewed"] }
  }).lean();

  return contracts.reduce((acc, c) => acc + ((c as any).contract_value || 0), 0);
}

export async function getCampaignConversionRate(campaignId: string, tenantId: string) {
  await dbConnect();
  
  const [totalLeads, closedWonOpps] = await Promise.all([
    CrmLead.countDocuments({ campaign_id: campaignId, tenantId }),
    CrmOpportunity.countDocuments({ 
      campaign_id: campaignId, 
      tenantId, 
      stage: "Closed Won" 
    })
  ]);

  if (totalLeads === 0) return 0;
  return Math.round((closedWonOpps / totalLeads) * 100);
}

// ─── Global Attribution Breakdown ──────────────────────────────────────────

export async function getAttributionBreakdownByChannel(tenantId: string) {
  await dbConnect();

  const match = { tenantId, campaign_id: { $exists: true, $ne: null } };

  // Aggregate leads by campaign channel
  const leadSourceAggregation = await CrmLead.aggregate([
    { $match: match },
    { $lookup: { from: 'crmcampaigns', localField: 'campaign_id', foreignField: '_id', as: 'campaign' } },
    { $unwind: "$campaign" },
    { $group: { _id: "$campaign.channel", count: { $sum: 1 } } }
  ]);

  // Aggregate revenue by campaign channel via contracts
  const contractRevenueAggregation = await CrmContract.aggregate([
    { 
      $match: { 
        tenantId, 
        campaign_id: { $exists: true, $ne: null },
        status: { $in: ["Active", "Renewal Due", "Expiring", "Renewed"] }
      } 
    },
    { $lookup: { from: 'crmcampaigns', localField: 'campaign_id', foreignField: '_id', as: 'campaign' } },
    { $unwind: "$campaign" },
    { $group: { _id: "$campaign.channel", revenue: { $sum: "$contract_value" } } }
  ]);

  const channels = Array.from(new Set([
    ...leadSourceAggregation.map(r => r._id),
    ...contractRevenueAggregation.map(r => r._id)
  ]));

  return channels.map(channel => ({
    channel,
    leads: leadSourceAggregation.find(r => r._id === channel)?.count || 0,
    revenue: contractRevenueAggregation.find(r => r._id === channel)?.revenue || 0,
  }));
}
