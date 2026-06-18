import levenshtein from "js-levenshtein";

export function detectDuplicates(record: any, existingRecords: any[], entityType: string) {
  const duplicates = [];

  for (const existing of existingRecords) {
    if (String(existing._id) === String(record._id)) continue;

    let score = 0;
    const checks = 0;

    if (entityType === "Lead" || entityType === "Contact") {
      if (record.email && existing.email && record.email.toLowerCase() === existing.email.toLowerCase()) {
        score += 80;
      }
      if (record.phone && existing.phone && record.phone === existing.phone) {
        score += 40;
      }
      
      const name1 = record.lead_name || `${record.first_name} ${record.last_name}`;
      const name2 = existing.lead_name || `${existing.first_name} ${existing.last_name}`;
      
      if (name1 && name2) {
        const dist = levenshtein(name1.toLowerCase(), name2.toLowerCase());
        if (dist <= 2) score += 30; // Close name match
      }
    } else if (entityType === "Account") {
      if (record.company_name && existing.company_name) {
        const dist = levenshtein(record.company_name.toLowerCase(), existing.company_name.toLowerCase());
        if (dist <= 2) score += 90;
      }
      if (record.website && existing.website && record.website.toLowerCase() === existing.website.toLowerCase()) {
        score += 60;
      }
    }

    if (score >= 80) {
      duplicates.push({
        recordId: existing._id,
        confidence: Math.min(score, 100),
        reason: "Similar match found on key identifiers"
      });
    }
  }

  return duplicates;
}
