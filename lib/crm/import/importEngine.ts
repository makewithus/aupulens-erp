export function validateImportPayload(records: any[], entityType: string) {
  const errors = [];
  const validRecords = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    let isValid = true;
    const rowErrors = [];

    if (entityType === "Lead" || entityType === "Contact") {
      if (!r.email && !r.phone) {
        isValid = false;
        rowErrors.push("Missing email or phone");
      }
      if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
        isValid = false;
        rowErrors.push("Invalid email format");
      }
    } else if (entityType === "Account") {
      if (!r.company_name) {
        isValid = false;
        rowErrors.push("Missing company_name");
      }
    } else if (entityType === "Opportunity") {
      if (!r.deal_name || !r.amount || isNaN(r.amount)) {
        isValid = false;
        rowErrors.push("Missing deal_name or invalid amount");
      }
    }

    if (isValid) {
      validRecords.push(r);
    } else {
      errors.push({ row: i + 2, data: r, reasons: rowErrors });
    }
  }

  // Duplicate detection in the batch itself
  const emails = new Set();
  const dedupedRecords = validRecords.filter(r => {
    if (r.email) {
      if (emails.has(r.email)) return false;
      emails.add(r.email);
    }
    return true;
  });

  return {
    success: errors.length === 0,
    validRecords: dedupedRecords,
    errors,
    duplicatesRemoved: validRecords.length - dedupedRecords.length
  };
}
