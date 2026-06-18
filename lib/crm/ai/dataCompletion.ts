export function analyzeDataCompletion(entityType: string, record: any) {
  const missingFields = [];
  
  if (entityType === "Lead") {
    if (!record.industry) missingFields.push("industry");
    if (!record.annual_revenue) missingFields.push("budget");
    if (!record.phone) missingFields.push("phone");
    if (!record.source) missingFields.push("source");
  } else if (entityType === "Opportunity") {
    if (!record.close_date) missingFields.push("close_date");
    if (!record.amount || record.amount === 0) missingFields.push("amount");
  } else if (entityType === "Account") {
    if (!record.industry) missingFields.push("industry");
    if (!record.website) missingFields.push("website");
  }

  const completeFields = Object.keys(record).filter(k => record[k] && typeof record[k] !== "object").length;
  const totalRelevantFields = completeFields + missingFields.length;
  const score = Math.floor((completeFields / totalRelevantFields) * 100);

  return {
    completionScore: score,
    missingFields,
    suggestions: missingFields.map(f => `Update missing field: ${f}`)
  };
}
