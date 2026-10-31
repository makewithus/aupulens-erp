function normalizeText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Natural identity tokens used for both within-file and existing-record checks. */
export function getImportDuplicateKeys(record: Record<string, any>, entityType: string): string[] {
  if (entityType === "Lead") {
    return [
      normalizeText(record.email) && `email:${normalizeText(record.email)}`,
      normalizePhone(record.phone) && `phone:${normalizePhone(record.phone)}`,
    ].filter(Boolean) as string[];
  }
  if (entityType === "Contact") {
    return [
      normalizeText(record.email) && `email:${normalizeText(record.email)}`,
      normalizePhone(record.mobile ?? record.phone) && `phone:${normalizePhone(record.mobile ?? record.phone)}`,
    ].filter(Boolean) as string[];
  }
  if (entityType === "Account") {
    const name = normalizeText(record.company_name);
    return name ? [`account:${name}`] : [];
  }
  if (entityType === "Opportunity") {
    const name = normalizeText(record.deal_name);
    const account = normalizeText(record.account_name ?? record.account_id?.company_name ?? record.account_id);
    return name && account ? [`opportunity:${account}:${name}`] : [];
  }
  return [];
}

export function validateImportPayload(records: any[], entityType: string) {
  const errors = [];
  const validRecords = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    let isValid = true;
    const rowErrors = [];

    if (entityType === "Lead" || entityType === "Contact") {
      if (!r.email && !(entityType === "Contact" ? r.mobile : r.phone)) {
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

  // Deduplicate this file using every natural identifier available. For leads
  // and contacts, either a matching email or phone identifies the same record.
  const seenKeys = new Set<string>();
  let duplicatesRemoved = 0;
  const dedupedRecords = validRecords.filter(r => {
    const keys = getImportDuplicateKeys(r, entityType);
    if (keys.some((key) => seenKeys.has(key))) {
      duplicatesRemoved += 1;
      return false;
    }
    keys.forEach((key) => seenKeys.add(key));
    return true;
  });

  return {
    success: errors.length === 0,
    validRecords: dedupedRecords,
    errors,
    duplicatesRemoved
  };
}
