import { AI_ACTION_TYPE, TRANSACTION_LOCK_MODULE_VALUES, type AiActionType } from "@/lib/constants/statuses";

export interface DetectedIntent {
  actionType: AiActionType;
  params: Record<string, unknown>;
}

/**
 * Lightweight, dependency-free intent detector for the specific accounting
 * actions the AI command bar is allowed to *propose* (never auto-execute).
 * Returns null when the message doesn't match a known destructive/financial
 * action — callers should fall back to normal read-only chat in that case.
 */
export function detectAccountingActionIntent(message: string): DetectedIntent | null {
  const text = message.trim();

  // "create an expense account called Marketing" / "create an account named Rent Payable of type Expense"
  const createAccountMatch = text.match(
    /create\s+(?:an?\s+)?(?:(income|expense|asset|liability|equity|bank|cash)\s+)?account\s+(?:called|named)\s+"?([^".]+?)"?(?:\s+of\s+type\s+(\w+))?[.!]?$/i,
  );
  if (createAccountMatch) {
    const accountType = createAccountMatch[3] || createAccountMatch[1];
    return {
      actionType: AI_ACTION_TYPE.CREATE_ACCOUNT,
      params: {
        accountName: createAccountMatch[2].trim(),
        accountType: accountType ? accountType[0].toUpperCase() + accountType.slice(1).toLowerCase() : undefined,
      },
    };
  }

  // "lock Sales transactions up to 31 Mar 2026" / "lock all transactions up to 2026-03-31 because year end"
  const lockMatch = text.match(/lock\s+(sales|purchases|banking|accountant|all)\s+transactions?\s+up\s?to\s+([^,.]+?)(?:\s+because\s+(.+))?[.!]?$/i);
  if (lockMatch) {
    const lockModule = lockMatch[1].toLowerCase();
    if (!TRANSACTION_LOCK_MODULE_VALUES.includes(lockModule as any)) return null;
    const parsedDate = new Date(lockMatch[2].trim());
    if (Number.isNaN(parsedDate.getTime())) return null;
    return {
      actionType: AI_ACTION_TYPE.LOCK_TRANSACTIONS,
      params: { module: lockModule, lockedUpToDate: parsedDate.toISOString(), reason: lockMatch[3]?.trim() },
    };
  }

  // "unlock Sales transactions" / "unlock all transactions"
  const unlockMatch = text.match(/unlock\s+(sales|purchases|banking|accountant|all)\s+transactions?/i);
  if (unlockMatch) {
    const unlockModule = unlockMatch[1].toLowerCase();
    if (!TRANSACTION_LOCK_MODULE_VALUES.includes(unlockModule as any)) return null;
    return { actionType: AI_ACTION_TYPE.UNLOCK_TRANSACTIONS, params: { module: unlockModule } };
  }

  return null;
}
