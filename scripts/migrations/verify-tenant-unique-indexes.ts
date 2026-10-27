/**
 * Idempotent Preflight Verification for Tenant-Scoped Unique Indexes
 *
 * Checks MongoDB collections for:
 * 1. Global vs compound tenant-scoped indexes
 * 2. Uniqueness violations (duplicate codes within the same tenant)
 * 3. Cross-tenant duplicates (identical codes across different tenants — allowed and expected)
 *
 * SAFETY RULES:
 * - Read-only analysis by default.
 * - DOES NOT drop production indexes automatically.
 * - Idempotent and safe to run in any environment.
 */
import mongoose from "mongoose";

interface IndexCheckSummary {
  collection: string;
  indexes: Array<{ name: string; key: Record<string, any>; unique?: boolean }>;
  compoundUniqueConfirmed: boolean;
  legacyGlobalIndexFound: boolean;
  intraTenantDuplicates: number;
  crossTenantDuplicates: number;
}

export async function checkCollectionIndexes(
  db: mongoose.mongo.Db,
  collectionName: string,
  businessKey: string
): Promise<IndexCheckSummary> {
  const existingCollections = await db.listCollections({ name: collectionName }).toArray();
  if (existingCollections.length === 0) {
    return {
      collection: collectionName,
      indexes: [],
      compoundUniqueConfirmed: true, // Schema declares compound index, collection not yet instantiated
      legacyGlobalIndexFound: false,
      intraTenantDuplicates: 0,
      crossTenantDuplicates: 0,
    };
  }

  const coll = db.collection(collectionName);
  const indexes = await coll.indexes();

  let compoundUniqueConfirmed = false;
  let legacyGlobalIndexFound = false;

  for (const idx of indexes) {
    const keys = Object.keys(idx.key);
    if (idx.unique) {
      if (keys.length === 1 && keys[0] === businessKey) {
        legacyGlobalIndexFound = true;
      }
      if (keys.includes("tenantId") && keys.includes(businessKey)) {
        compoundUniqueConfirmed = true;
      }
    }
  }

  // Aggregate intra-tenant duplicates: count where (tenantId, businessKey) appears > 1
  const intraDupes = await coll
    .aggregate([
      { $match: { [businessKey]: { $exists: true, $ne: null } } },
      { $group: { _id: { tenantId: "$tenantId", code: `$${businessKey}` }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  // Aggregate cross-tenant instances: count where the same businessKey exists across >= 2 tenants
  const crossDupes = await coll
    .aggregate([
      { $match: { [businessKey]: { $exists: true, $ne: null } } },
      { $group: { _id: `$${businessKey}`, tenants: { $addToSet: "$tenantId" } } },
      { $match: { "tenants.1": { $exists: true } } },
    ])
    .toArray();

  return {
    collection: collectionName,
    indexes: indexes.map((i) => ({ name: i.name, key: i.key, unique: i.unique })),
    compoundUniqueConfirmed,
    legacyGlobalIndexFound,
    intraTenantDuplicates: intraDupes.length,
    crossTenantDuplicates: crossDupes.length,
  };
}

async function run() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/aupulens";
  console.log(`Connecting to MongoDB: ${uri.replace(/\/\/.*@/, "//***:***@")}`);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  if (!db) {
    console.error("Database connection not ready");
    process.exit(1);
  }

  const targets = [
    { coll: "inventoryitems", key: "itemCode" },
    { coll: "warehouses", key: "warehouseCode" },
    { coll: "saleorders", key: "header.name" },
    { coll: "contracts", key: "contract_number" },
  ];

  console.log("\n=======================================================");
  console.log("  TENANT-SCOPED UNIQUE INDEX PREFLIGHT VERIFICATION");
  console.log("=======================================================\n");

  for (const t of targets) {
    const summary = await checkCollectionIndexes(db, t.coll, t.key);
    console.log(`Collection: ${summary.collection} (Key: ${t.key})`);
    console.log(`  - Compound Unique Index ({ tenantId, ${t.key} }): ${summary.compoundUniqueConfirmed ? "CONFIRMED" : "NOT FOUND"}`);
    console.log(`  - Legacy Global Unique Index: ${summary.legacyGlobalIndexFound ? "DETECTED (Needs migration)" : "NONE"}`);
    console.log(`  - Intra-Tenant Conflicts: ${summary.intraTenantDuplicates}`);
    console.log(`  - Cross-Tenant Shares (Valid Multi-Tenancy): ${summary.crossTenantDuplicates}\n`);
  }

  await mongoose.disconnect();
  console.log("Preflight verification completed successfully.");
}

if (require.main === module) {
  run().catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
}
