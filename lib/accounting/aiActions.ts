import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";
import Budget from "@/models/finance/Budget";
import BankingRule from "@/models/finance/BankingRule";
import TransactionLock from "@/models/finance/TransactionLock";
import { AI_ACTION_TYPE, TRANSACTION_LOCK_MODULE_VALUES, type AiActionType } from "@/lib/constants/statuses";
import { escapeRegex } from "@/lib/utils/regex";

export class AiActionError extends Error {}

async function resolveAccountTypeId(tenantId: string, accountTypeNameOrId: string) {
  if (!accountTypeNameOrId) throw new AiActionError("Account Type is required");
  const byId = await AccountType.findOne({ _id: accountTypeNameOrId, tenantId }).lean();
  if (byId) return byId._id;
  const byName = await AccountType.findOne({ tenantId, name: new RegExp(`^${escapeRegex(accountTypeNameOrId)}$`, "i") }).lean();
  if (byName) return byName._id;
  throw new AiActionError(`Account Type "${accountTypeNameOrId}" not found`);
}

/** Builds a human-readable preview of what an action will do, without touching the database (except lookups). */
export async function buildActionPreview(actionType: AiActionType, params: any, tenantId: string): Promise<Record<string, unknown>> {
  await connectDB();

  switch (actionType) {
    case AI_ACTION_TYPE.CREATE_ACCOUNT:
      return {
        summary: `Create a new account "${params.accountName}" of type "${params.accountType}"${params.accountCode ? ` with code ${params.accountCode}` : ""}.`,
        accountName: params.accountName,
        accountType: params.accountType,
        accountCode: params.accountCode || null,
      };
    case AI_ACTION_TYPE.UPDATE_ACCOUNT: {
      const acc = await Account.findOne({ _id: params.accountId, tenantId }).lean();
      if (!acc) throw new AiActionError("Account not found");
      return { summary: `Update account "${(acc as any).accountName}" with: ${JSON.stringify(params.patch)}`, before: acc, patch: params.patch };
    }
    case AI_ACTION_TYPE.DELETE_ACCOUNT: {
      const acc = await Account.findOne({ _id: params.accountId, tenantId }).lean();
      if (!acc) throw new AiActionError("Account not found");
      if ((acc as any).isLocked) throw new AiActionError("This account is locked and cannot be deleted");
      return { summary: `Delete account "${(acc as any).accountName}". This cannot be undone.`, account: acc };
    }
    case AI_ACTION_TYPE.LOCK_TRANSACTIONS:
      if (!TRANSACTION_LOCK_MODULE_VALUES.includes(params.module)) throw new AiActionError("Invalid module");
      if (!params.lockedUpToDate) throw new AiActionError("lockedUpToDate is required");
      return {
        summary: `Lock ${params.module} transactions up to ${new Date(params.lockedUpToDate).toLocaleDateString()}.${params.reason ? ` Reason: ${params.reason}` : ""}`,
        module: params.module,
        lockedUpToDate: params.lockedUpToDate,
        reason: params.reason || null,
      };
    case AI_ACTION_TYPE.UNLOCK_TRANSACTIONS:
      if (!TRANSACTION_LOCK_MODULE_VALUES.includes(params.module)) throw new AiActionError("Invalid module");
      return { summary: `Unlock ${params.module} transactions.`, module: params.module };
    case AI_ACTION_TYPE.CREATE_BUDGET:
      if (!params.name || !params.fiscalYear) throw new AiActionError("Budget name and fiscal year are required");
      return {
        summary: `Create budget "${params.name}" for ${params.fiscalYear} (${params.period || "monthly"}) with ${(params.lines || []).length} account line(s).`,
        name: params.name,
        fiscalYear: params.fiscalYear,
        period: params.period || "monthly",
        lineCount: (params.lines || []).length,
      };
    case AI_ACTION_TYPE.CREATE_BANKING_RULE:
      if (!params.ruleName || !params.recordAs || !params.accountId) throw new AiActionError("Rule name, Record As, and Account are required");
      return {
        summary: `Create banking rule "${params.ruleName}" recording matching ${params.applyTo || "deposits"} as ${params.recordAs}.`,
        ruleName: params.ruleName,
        recordAs: params.recordAs,
      };
    default:
      throw new AiActionError(`Unsupported action type: ${actionType}`);
  }
}

/** Executes a previously proposed action after user confirmation. */
export async function executeAction(
  actionType: AiActionType,
  params: any,
  tenantId: string,
  userId: string,
): Promise<{ resultRef: string; result: unknown }> {
  await connectDB();

  switch (actionType) {
    case AI_ACTION_TYPE.CREATE_ACCOUNT: {
      const accountTypeId = await resolveAccountTypeId(tenantId, params.accountType);
      const doc = await Account.create({
        tenantId,
        accountName: params.accountName,
        accountCode: params.accountCode || undefined,
        accountType: accountTypeId,
        description: params.description,
        createdBy: userId,
        isLocked: false,
      });
      return { resultRef: String(doc._id), result: doc };
    }
    case AI_ACTION_TYPE.UPDATE_ACCOUNT: {
      const doc = await Account.findOneAndUpdate({ _id: params.accountId, tenantId }, { $set: params.patch }, { new: true });
      if (!doc) throw new AiActionError("Account not found");
      return { resultRef: String(doc._id), result: doc };
    }
    case AI_ACTION_TYPE.DELETE_ACCOUNT: {
      const acc = await Account.findOne({ _id: params.accountId, tenantId });
      if (!acc) throw new AiActionError("Account not found");
      if (acc.isLocked) throw new AiActionError("This account is locked and cannot be deleted");
      await Account.deleteOne({ _id: params.accountId, tenantId });
      return { resultRef: params.accountId, result: { deleted: true } };
    }
    case AI_ACTION_TYPE.LOCK_TRANSACTIONS: {
      const doc = await TransactionLock.findOneAndUpdate(
        { tenantId, module: params.module },
        { $set: { isLocked: true, lockedUpToDate: new Date(params.lockedUpToDate), reason: params.reason || "", lockedBy: userId } },
        { new: true, upsert: true },
      );
      return { resultRef: String(doc._id), result: doc };
    }
    case AI_ACTION_TYPE.UNLOCK_TRANSACTIONS: {
      const doc = await TransactionLock.findOneAndUpdate(
        { tenantId, module: params.module },
        { $set: { isLocked: false, lockedUpToDate: null } },
        { new: true, upsert: true },
      );
      return { resultRef: String(doc._id), result: doc };
    }
    case AI_ACTION_TYPE.CREATE_BUDGET: {
      const doc = await Budget.create({
        tenantId,
        name: params.name,
        fiscalYear: params.fiscalYear,
        period: params.period || "monthly",
        lines: params.lines || [],
        includeBalanceSheetAccounts: !!params.includeBalanceSheetAccounts,
        createdBy: userId,
      });
      return { resultRef: String(doc._id), result: doc };
    }
    case AI_ACTION_TYPE.CREATE_BANKING_RULE: {
      const doc = await BankingRule.create({
        tenantId,
        ruleName: params.ruleName,
        applyTo: params.applyTo || "deposits",
        transactionHandling: params.transactionHandling || "recognized",
        criteriaMatch: params.criteriaMatch || "any",
        criteria: params.criteria || [],
        recordAs: params.recordAs,
        accountId: params.accountId,
        associateAccountsMode: params.associateAccountsMode || "custom",
        createdBy: userId,
      });
      return { resultRef: String(doc._id), result: doc };
    }
    default:
      throw new AiActionError(`Unsupported action type: ${actionType}`);
  }
}
