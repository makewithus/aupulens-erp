export function calculateLeadScore(lead: any): number {
  let score = 0;
  if (lead.company_name) score += 10;
  if (lead.budget_range) score += 15;
  if (lead.source === 'Referral' || lead.source === 'Event') score += 15;
  else if (lead.source === 'Paid Ads') score += 10;
  else if (lead.source === 'Organic Search') score += 8;
  if (lead.notes) score += 5;
  if (lead.email && lead.phone) score += 5;
  // decision_maker logic applied during update
  return Math.min(score, 100);
}
