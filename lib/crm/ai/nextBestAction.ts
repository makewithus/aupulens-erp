export function determineNextBestAction(entityType: string, payload: any) {
  const actions = [];

  if (entityType === "Opportunity") {
    if (payload.stage === "Proposal") {
      actions.push({ action: "Follow Up Customer", reason: "Proposal sent, awaiting response", priority: "High", confidence: 90 });
    } else if (payload.amount > 100000) {
      actions.push({ action: "Escalate Opportunity", reason: "High value deal, assign VP", priority: "Critical", confidence: 95 });
    } else if (payload.stage === "Discovery") {
      actions.push({ action: "Schedule Demo", reason: "Discovery complete", priority: "Medium", confidence: 80 });
    }
  } else if (entityType === "Lead") {
    if (payload.status === "New") {
      actions.push({ action: "Send Proposal", reason: "New high-score lead", priority: "High", confidence: 85 });
    }
  } else if (entityType === "Contract") {
    const daysToExpiry = payload.end_date ? (new Date(payload.end_date).getTime() - Date.now()) / 86400000 : 999;
    if (daysToExpiry < 60 && payload.status === "Active") {
      actions.push({ action: "Create Renewal Task", reason: `Contract expires in ${Math.floor(daysToExpiry)} days`, priority: "High", confidence: 95 });
      actions.push({ action: "Create Upsell Opportunity", reason: "Good time to discuss expansion", priority: "Medium", confidence: 70 });
    }
  }

  // Default fallback
  if (actions.length === 0) {
    actions.push({ action: "Re-engage Lead", reason: "Maintain relationship", priority: "Low", confidence: 60 });
  }

  return actions;
}
