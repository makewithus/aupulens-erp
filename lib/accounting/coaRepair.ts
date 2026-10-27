import mongoose from "mongoose";
import { createHash } from "node:crypto";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import { DEFAULT_ACCOUNTS } from "./coa-seeder";

export async function planCoaRepair(tenantId: string, session?: mongoose.ClientSession) {
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new Error("Explicit tenant required");
  const accounts = await Account.find({ tenantId }).sort({ _id: 1 }).session(session || null).lean();
  const journals = await JournalEntry.find({ tenantId, status: "posted" }).select("lineIds.accountId lineIds.debit lineIds.credit").sort({ _id: 1 }).session(session || null).lean();
  const refs = new Map<string, number>();
  for (const journal of journals) for (const line of journal.lineIds || []) refs.set(String(line.accountId), (refs.get(String(line.accountId)) || 0) + 1);
  const canonical = new Map(DEFAULT_ACCOUNTS.map(a => [a.code, a]));
  const groups = new Map<string, string[]>();
  const blockers: string[] = [];
  const changes: { id: string; code: string; before: any; after: any; reason: string; postedLineReferences: number }[] = [];
  for (const account of accounts) {
    const name = String(account.accountName || account.name || "").trim().toLowerCase();
    if (name) groups.set(name, [...(groups.get(name) || []), String(account._id)]);
    const target = canonical.get(account.code || "");
    if (target && (account.internal_group !== target.internal_group || account.account_type !== target.account_type)) {
      changes.push({ id: String(account._id), code: account.code!, before: { internal_group: account.internal_group, account_type: account.account_type }, after: { internal_group: target.internal_group, account_type: target.account_type }, reason: `Canonical code ${account.code}: ${target.name}; preserves identifier and all journal references`, postedLineReferences: refs.get(String(account._id)) || 0 });
    } else if (!target && (!account.internal_group || account.internal_group === "off_balance" || !account.account_type || account.account_type === "off_balance")) {
      blockers.push(`Unclassified noncanonical account ${account._id}: manual classification required`);
    }
  }
  const duplicates = [...groups.entries()].filter(([,ids]) => ids.length > 1).map(([name, ids]) => ({ name, ids, postedReferences: ids.map(id=>({id,count:refs.get(id)||0})), action: "Manual approved mapping required; no automatic merge, delete, deactivation or reference rewrite" }));
  for (const duplicate of duplicates) blockers.push(`Ambiguous duplicate name among ${duplicate.ids.join(", ")}`);
  const known = new Set(accounts.map(a=>String(a._id)));
  for (const id of refs.keys()) if (!known.has(id)) blockers.push(`Posted journal references missing or foreign account ${id}`);
  return { tenantId, beforeCounts: { accounts: accounts.length, postedJournals: journals.length, postedLines: [...refs.values()].reduce((a,b)=>a+b,0) }, changes, duplicates, blockers,
    fingerprint: createHash("sha256").update(JSON.stringify({ accounts, journals })).digest("hex"),
    policy: "Dry-run by default. Classification only. All IDs, balances and posted lines preserved. Ambiguous cases block execution." };
}

export async function applyCoaRepair(input: { tenantId: string; confirmedTenantId: string; execute: boolean; fingerprint: string }) {
  if (!input.execute || input.tenantId !== input.confirmedTenantId) throw new Error("Explicit execution and matching tenant confirmation required");
  // This task authorizes writes only in disposable test environments.
  if (process.env.NODE_ENV !== "test" || !mongoose.connection.name.startsWith("aupulens_test_")) throw new Error("Execution restricted to disposable test database");
  return mongoose.connection.transaction(async session => {
    const before = await planCoaRepair(input.tenantId, session);
    if (before.fingerprint !== input.fingerprint) throw new Error("Repair proposal is stale; rerun dry-run");
    if (before.blockers.length) throw new Error("Ambiguous or missing accounts require approved manual resolution");
    for (const change of before.changes) await Account.updateOne({ _id: change.id, tenantId: input.tenantId }, { $set: change.after }, { session, runValidators: true });
    const after = await planCoaRepair(input.tenantId, session);
    if (JSON.stringify(before.beforeCounts) !== JSON.stringify(after.beforeCounts)) throw new Error("Account or journal count changed unexpectedly");
    return { tenantId: input.tenantId, applied: before.changes.length, before, after, reconciliation: "Identifiers, account/journal/line counts preserved; report classification changed as proposed. No posted accounting entries were inserted or rewritten." };
  });
}
