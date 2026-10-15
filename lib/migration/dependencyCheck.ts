import Account from "@/models/finance/Account";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";

type MissingJournalAccount = { code: string; journalIds: string[] };

/**
 * Final dependency gate for posted journal imports. Preview may treat a
 * duplicate Account row as a possible reference while the operator is still
 * deciding what to do. Before the first business record is written, however,
 * every journal account must either exist in this tenant or be scheduled for
 * import/update by this batch.
 */
export async function checkJournalAccountDependencies(batchId: unknown, tenantId: string) {
  const journals = await MigrationRecord.find({
    batchId,
    tenantId,
    entityType: MIGRATION_ENTITY.JOURNAL_ENTRY,
    $or: [
      { status: "valid" },
      { status: "duplicate", duplicateAction: { $in: ["create", "update"] } },
      { status: "invalid", "errors.message": /account code.*(missing|skipped|not available)/i },
    ],
  }).select("_id mappedData.journalId mappedData.linesJson").lean();

  const codeToJournals = new Map<string, Set<string>>();
  for (const journal of journals as any[]) {
    let lines: any[];
    try {
      lines = JSON.parse(String(journal.mappedData?.linesJson || "[]"));
    } catch {
      continue; // The regular row validator reports malformed JSON.
    }
    if (!Array.isArray(lines)) continue;
    const journalId = String(journal.mappedData?.journalId || journal._id);
    for (const line of lines) {
      const code = String(line?.account_code ?? "").trim();
      if (!code) continue;
      const ids = codeToJournals.get(code) ?? new Set<string>();
      ids.add(journalId);
      codeToJournals.set(code, ids);
    }
  }

  const codes = [...codeToJournals.keys()];
  if (codes.length === 0) return { ready: true, reopenedSkipped: 0, missing: [] as MissingJournalAccount[] };

  const [workspaceAccounts, batchAccounts] = await Promise.all([
    Account.find({ tenantId, $or: [{ code: { $in: codes } }, { accountCode: { $in: codes } }] })
      .select("code accountCode").lean(),
    MigrationRecord.find({
      batchId,
      tenantId,
      entityType: MIGRATION_ENTITY.ACCOUNT,
      "mappedData.accountCode": { $in: codes },
    }).select("_id status duplicateAction mappedData.accountCode errors").lean(),
  ]);

  const available = new Set<string>();
  for (const account of workspaceAccounts as any[]) {
    if (account.code) available.add(String(account.code).trim());
    if (account.accountCode) available.add(String(account.accountCode).trim());
  }
  for (const account of batchAccounts as any[]) {
    if (account.status === "valid" || account.status === "migrated"
      || (account.status === "duplicate" && ["create", "update"].includes(account.duplicateAction))) {
      available.add(String(account.mappedData.accountCode).trim());
    }
  }

  const missingCodes = codes.filter((code) => !available.has(code));
  const skippedAccounts = (batchAccounts as any[]).filter((account) =>
    missingCodes.includes(String(account.mappedData?.accountCode ?? "").trim()) && account.status === "skipped",
  );
  const failedAccounts = (batchAccounts as any[]).filter((account) =>
    missingCodes.includes(String(account.mappedData?.accountCode ?? "").trim()) && account.status === "failed",
  );

  // A source-level preview cannot predict every target-side write failure. If
  // an Account write fails after the batch passed preview, turn that failure
  // back into an editable validation issue before dependent journals run.
  if (failedAccounts.length > 0) {
    await MigrationRecord.bulkWrite(failedAccounts.map((account) => ({
      updateOne: {
        filter: { _id: account._id, tenantId, status: "failed" },
        update: {
          $set: {
            status: "invalid",
            errors: [
              ...(Array.isArray(account.errors) ? account.errors : []),
              {
                field: "accountCode",
                message: `Account code '${String(account.mappedData?.accountCode ?? "").trim()}' could not be saved. Fix this Account row before importing dependent journal entries.`,
              },
            ],
          },
        },
      },
    })), { ordered: false });
  }

  let reopenedSkipped = 0;
  if (skippedAccounts.length > 0) {
    const result = await MigrationRecord.updateMany(
      { _id: { $in: skippedAccounts.map((account) => account._id) }, tenantId, status: "skipped" },
      {
        $set: {
          status: "duplicate",
          errors: [{
            message: "This account was skipped, but one or more journal entries require it. Choose Merge / Update or Force Create, or correct the dependent journal account codes.",
          }],
        },
        $unset: { duplicateAction: "", targetRecordId: "" },
      },
    );
    reopenedSkipped = result.modifiedCount;
    for (const account of skippedAccounts) {
      const code = String(account.mappedData.accountCode).trim();
      available.add(code);
    }
  }

  const missing: MissingJournalAccount[] = missingCodes
    .filter((code) => !available.has(code))
    .map((code) => ({ code, journalIds: [...(codeToJournals.get(code) ?? [])] }));

  if (missing.length > 0) {
    const affected = journals
      .map((journal: any) => {
        try {
          const lines = JSON.parse(String(journal.mappedData?.linesJson || "[]"));
          const recordErrors = Array.isArray(lines)
            ? missing
              .filter((item) => lines.some((line: any) => item.code === String(line?.account_code ?? "").trim()))
              .map((item) => ({
                field: "linesJson",
                message: `Journal account code '${item.code}' is not available in this organization or as an importable Account row. Include the account or correct the source journal before starting migration.`,
              }))
            : [];
          return recordErrors.length > 0 ? { id: journal._id, errors: recordErrors } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ id: unknown; errors: Array<{ field: string; message: string }> }>;
    if (affected.length > 0) {
      await MigrationRecord.bulkWrite(affected.map((journal) => ({
        updateOne: {
          filter: { _id: journal.id, tenantId },
          update: { $set: { status: "invalid", errors: journal.errors } },
        },
      })));
    }
  }

  return { ready: missing.length === 0 && reopenedSkipped === 0 && failedAccounts.length === 0, reopenedSkipped, failedAccounts: failedAccounts.length, missing };
}
