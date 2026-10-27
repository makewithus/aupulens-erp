import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";

// Mongoose propagates this session to queries, saves and creates through async
// context, including writes made by helpers called several layers below a route.
mongoose.set("transactionAsyncLocalStorage", true);
const context = new AsyncLocalStorage<{ session: mongoose.ClientSession; afterCommit: (() => Promise<void>)[] }>();

export function getAccountingSession() {
  return context.getStore()?.session;
}

export function deferUntilAccountingCommit(work: () => Promise<void>): boolean {
  const current = context.getStore();
  if (!current) return false;
  current.afterCommit.push(work);
  return true;
}

class RejectedTransaction {
  constructor(readonly response: Response) { }
}

/** No standalone-Mongo fallback: a failed write or error response aborts all writes. */
export async function withAccountingTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (context.getStore()) return work();
  let committed: (() => Promise<void>)[] = [];
  try {
    const result = await mongoose.connection.transaction(async session => {
      // The driver may retry the callback; discard effects from aborted attempts.
      const state = { session, afterCommit: [] as (() => Promise<void>)[] };
      const value = await context.run(state, work);
      if (value instanceof Response && value.status >= 400) throw new RejectedTransaction(value);
      committed = state.afterCommit;
      return value;
    }, { readPreference: "primary", writeConcern: { w: "majority" } });
    // Run events outside the committed transaction/session. Consumers can only
    // observe complete accounting records, and rollback emits nothing.
    for (const effect of committed) await effect();
    return result as T;
  } catch (error: any) {
    if (error instanceof RejectedTransaction) return error.response as T;
    throw error;
  }
}
