import TransactionLock from "@/models/TransactionLock";
import { TRANSACTION_LOCK_MODULE, type TransactionLockModule } from "@/lib/constants/statuses";

export class TransactionLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionLockError";
  }
}

/**
 * Throws TransactionLockError if `date` falls on/before an active lock for
 * `module` (or the tenant's global "all" lock). Call before create/edit/delete
 * of any transaction in a locked module. Callers must have already called
 * connectDB() — this helper does not manage its own DB connection.
 */
export async function assertTransactionNotLocked(
  tenantId: string,
  module: Exclude<TransactionLockModule, "all">,
  date: Date | string | undefined | null,
): Promise<void> {
  if (!date) return;

  const txDate = new Date(date);
  if (Number.isNaN(txDate.getTime())) return;

  const locks = await TransactionLock.find({
    tenantId,
    isLocked: true,
    module: { $in: [module, TRANSACTION_LOCK_MODULE.ALL] },
    lockedUpToDate: { $ne: null },
  }).lean();

  for (const lock of locks) {
    if (lock.lockedUpToDate && txDate.getTime() <= new Date(lock.lockedUpToDate).getTime()) {
      const label = lock.module === TRANSACTION_LOCK_MODULE.ALL ? "All transactions" : `${module[0].toUpperCase()}${module.slice(1)} transactions`;
      throw new TransactionLockError(
        `${label} are locked up to ${new Date(lock.lockedUpToDate).toLocaleDateString()}. This transaction date falls within the locked period and cannot be created, edited, or deleted.`,
      );
    }
  }
}
