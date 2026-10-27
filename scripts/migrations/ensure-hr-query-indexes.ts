/**
 * Explicit, idempotent migration for the HR query indexes used by dashboards
 * and analytics. Run with `npm run migrate:hr-indexes`; this script never
 * runs automatically when the application starts.
 *
 * It checks unique-index conflicts before creating anything and never drops
 * an existing index or modifies records.
 */
import mongoose from "mongoose";
import { loadEnvConfig } from "@next/env";

type IndexSpec = {
  collection: string;
  keys: Record<string, 1 | -1>;
  unique?: boolean;
};

const indexes: IndexSpec[] = [
  { collection: "attendances", keys: { tenantId: 1, date: 1 } },
  { collection: "attendances", keys: { tenantId: 1, employeeId: 1, date: 1 }, unique: true },
  { collection: "performancereviews", keys: { tenantId: 1, rating: 1 } },
  { collection: "performancereviews", keys: { tenantId: 1, employeeId: 1, reviewPeriod: 1 }, unique: true },
  { collection: "payrolls", keys: { tenantId: 1, status: 1, disbursedAt: 1 } },
  { collection: "leaverequests", keys: { tenantId: 1, employeeId: 1 } },
  { collection: "leaverequests", keys: { tenantId: 1, status: 1 } },
  { collection: "leaverequests", keys: { tenantId: 1, status: 1, createdAt: -1 } },
  { collection: "leaverequests", keys: { tenantId: 1, startDate: 1, endDate: 1 } },
  { collection: "leaverequests", keys: { tenantId: 1, leaveType: 1 } },
];

function sameKeys(left: Record<string, number>, right: Record<string, number>) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value], i) =>
    rightEntries[i]?.[0] === key && rightEntries[i]?.[1] === value,
  );
}

async function run() {
  loadEnvConfig(process.cwd());
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI explicitly before running the HR index migration.");

  const apply = process.argv.includes("--apply");
  await mongoose.connect(uri, { autoIndex: false });
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection did not provide a database.");

  try {
    const existingCollections = new Set((await db.listCollections().toArray()).map((entry) => entry.name));
    const uniqueSpecs = indexes.filter((spec) => spec.unique);
    const conflicts: string[] = [];

    for (const spec of uniqueSpecs) {
      if (!existingCollections.has(spec.collection)) continue;
      const collection = db.collection(spec.collection);
      const duplicates = await collection.aggregate([
        { $group: { _id: Object.fromEntries(Object.keys(spec.keys).map((key) => [key, `$${key}`])), count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 5 },
      ]).toArray();
      if (duplicates.length) {
        conflicts.push(`${spec.collection} ${JSON.stringify(spec.keys)} has duplicate key groups`);
      }
    }

    if (conflicts.length) {
      throw new Error(`Unique index preflight failed; no indexes were created. Resolve duplicates first: ${conflicts.join("; ")}`);
    }

    const missing: IndexSpec[] = [];
    for (const spec of indexes) {
      const existing = existingCollections.has(spec.collection)
        ? await db.collection(spec.collection).indexes()
        : [];
      const sameKey = existing.find((index) => sameKeys(index.key as Record<string, number>, spec.keys));
      if (sameKey && !!sameKey.unique !== !!spec.unique) {
        throw new Error(
          `${spec.collection} already has ${sameKey.name} with incompatible uniqueness for ${JSON.stringify(spec.keys)}. No indexes were dropped.`,
        );
      }
      if (!sameKey) missing.push(spec);
    }

    let created = 0;
    for (const spec of missing) {
      const collection = db.collection(spec.collection);
      if (apply) {
        await collection.createIndex(spec.keys, { unique: spec.unique, background: true });
        created += 1;
      } else {
        console.log(`Would create ${spec.collection} ${JSON.stringify(spec.keys)}${spec.unique ? " unique" : ""}`);
      }
    }

    console.log(`${apply ? `Created ${created} missing indexes` : "Dry run complete; no indexes changed"} in database "${db.databaseName}".`);
    if (!apply) console.log("Run with --apply to create the listed indexes after reviewing the target database.");
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error("HR index migration failed:", error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
