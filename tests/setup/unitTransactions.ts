import dotenv from "dotenv";
dotenv.config();
process.env.RATE_LIMIT_STORE = "memory";
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/aupulens_test_default";
}
import { vi } from "vitest";
import mongoose from "mongoose";

// Protect shared/production database against accidental dropDatabase() in test suites
const originalDropDatabase = mongoose.Connection.prototype.dropDatabase;
mongoose.Connection.prototype.dropDatabase = async function (...args: any[]) {
  if (this.name === "test" || (!this.name?.includes("test") && !this.name?.includes("disposable") && !this.name?.startsWith("ns_migration_"))) {
    // Silently ignore or warn instead of dropping the live/shared Atlas database
    return;
  }
  return (originalDropDatabase as any).apply(this, args);
};

// Unit suites mock the DB/models and have no connection. Only those suites
// bypass a real transaction; Mongo integration suites execute the real boundary.
vi.mock("@/lib/accounting/transaction", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/accounting/transaction")>();
  return { ...actual, withAccountingTransaction: async <T>(work: () => Promise<T>) => {
    if (mongoose.connection.readyState === 0) return work();
    return actual.withAccountingTransaction(work);
  } };
});

