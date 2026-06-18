export function calculateConversionAnalytics(leads: any[], opportunities: any[]) {
  const totalLeads = leads.length;
  const convertedLeads = leads.filter(l => l.status === "Converted").length;

  const totalOpps = opportunities.length;
  const wonOpps = opportunities.filter(o => o.stage === "Closed Won").length;
  
  const leadToOppPercent = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;
  const oppToWonPercent = totalOpps > 0 ? (wonOpps / totalOpps) * 100 : 0;
  const fullFunnelPercent = totalLeads > 0 ? (wonOpps / totalLeads) * 100 : 0;

  // Mock stage drop-offs based on opportunity counts in each stage
  const stageCounts = {
    "Discovery": opportunities.filter(o => o.stage === "Discovery").length,
    "Proposal": opportunities.filter(o => o.stage === "Proposal").length,
    "Negotiation": opportunities.filter(o => o.stage === "Negotiation").length,
    "Closed Lost": opportunities.filter(o => o.stage === "Closed Lost").length
  };

  return {
    leadToOppPercent: Math.round(leadToOppPercent),
    oppToWonPercent: Math.round(oppToWonPercent),
    fullFunnelPercent: Math.round(fullFunnelPercent),
    stageDropOffs: stageCounts
  };
}
