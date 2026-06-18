export function runDataQualityCheck(records: any[], entityType: string) {
  const issues = [];
  const emails = new Set();
  const phones = new Set();

  for (const record of records) {
    // 1. Missing Fields
    if (!record.email && !record.phone) {
      issues.push({ type: "Missing Field", recordId: record._id, description: "No contact method provided." });
    }
    
    if (entityType === "Opportunity" && !record.amount) {
      issues.push({ type: "Missing Field", recordId: record._id, description: "Opportunity missing amount." });
    }

    // 2. Duplicates
    if (record.email) {
      if (emails.has(record.email)) issues.push({ type: "Duplicate", recordId: record._id, description: `Duplicate email: ${record.email}` });
      else emails.add(record.email);
    }

    if (record.phone) {
      if (phones.has(record.phone)) issues.push({ type: "Duplicate", recordId: record._id, description: `Duplicate phone: ${record.phone}` });
      else phones.add(record.phone);
    }

    // 3. Stale Records (No update in 90 days)
    const daysSinceUpdate = (Date.now() - new Date(record.updatedAt).getTime()) / 86400000;
    if (daysSinceUpdate > 90) {
      issues.push({ type: "Stale Record", recordId: record._id, description: `Not updated in ${Math.round(daysSinceUpdate)} days.` });
    }

    // 4. Orphan Records
    if (entityType === "Contact" && !record.account_id) {
      issues.push({ type: "Orphan Record", recordId: record._id, description: "Contact not linked to an Account." });
    }
  }

  return issues;
}
