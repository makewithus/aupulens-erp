import CrmOpportunity from "@/models/crm/Opportunity";

export async function validateOpportunityStage(opportunity: any, newStage: string) {
  const stages = ['Prospecting','Discovery','Requirement Gathering','Solution Fit','Proposal Sent','Negotiation','Approval','Closed Won','Closed Lost'];
  const currentIndex = stages.indexOf(opportunity.stage);
  const newIndex = stages.indexOf(newStage);

  if (newIndex === -1) return { valid: false, message: "Invalid stage." };

  // Cannot jump backwards unless to Closed Lost
  if (newIndex < currentIndex && newStage !== 'Closed Lost') {
    return { valid: false, message: "Cannot move backward in the pipeline unless marking as Closed Lost." };
  }

  // Allow jumping to Closed Lost anytime
  if (newStage === 'Closed Lost') return { valid: true };

  // Allow jumping forward (removed strict linear progression rule)

  if (newStage === 'Requirement Gathering') {
    if (!opportunity.budget_confirmed || !opportunity.timeline_confirmed) {
      // Relaxed to allow fast-tracking
      // return { valid: false, message: "Requirement Gathering requires confirmed budget and timeline." };
    }
  }

  if (newStage === 'Proposal Sent') {
    // Relaxed decision maker rule for quick-action button
    // const hasDecisionMaker = opportunity.stakeholders?.some((s: any) => s.role === 'Decision Maker');
    // if (!hasDecisionMaker) return { valid: false, message: "Proposal Sent requires at least one Decision Maker." };
  }

  if (newStage === 'Closed Won') {
    // Basic mocked check for quotes - in a real scenario we'd query CrmQuote
    if (!opportunity.amount || opportunity.amount <= 0) {
      return { valid: false, message: "Closed Won requires a valid deal amount > 0." };
    }
  }

  return { valid: true };
}
