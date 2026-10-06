import mongoose from "mongoose";
import Product from "@/models/inventory/Product";
import MigrationIdentityMap from "@/models/admin/MigrationIdentityMap";
import MigrationRecord from "@/models/admin/MigrationRecord";

type DedupeResult = {
  groups: number;
  removed: number;
};

function normalizeKey(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function productDedupeKey(product: any) {
  const code = normalizeKey(product.tab_general_information?.default_code);
  if (code) return `code:${code}`;

  const name = normalizeKey(product.header?.name);
  return name ? `name:${name}` : "";
}

function newest(products: any[]) {
  return [...products].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  })[0];
}

async function repointProductReferences(tenantId: string, duplicateIds: mongoose.Types.ObjectId[], keepId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db;
  if (!db || duplicateIds.length === 0) return;

  await Promise.all([
    db.collection("stocks").updateMany({ tenantId, product: { $in: duplicateIds } }, { $set: { product: keepId } }),
    db.collection("stockmoves").updateMany(
      { tenantId, "lines.productId": { $in: duplicateIds } },
      { $set: { "lines.$[line].productId": keepId } },
      { arrayFilters: [{ "line.productId": { $in: duplicateIds } }] },
    ).catch(() => null),
    db.collection("salesinvoices").updateMany(
      { tenantId, "lineItems.itemId": { $in: duplicateIds } },
      { $set: { "lineItems.$[line].itemId": keepId } },
      { arrayFilters: [{ "line.itemId": { $in: duplicateIds } }] },
    ).catch(() => null),
    db.collection("salesquotations").updateMany(
      { tenantId, "lineItems.itemId": { $in: duplicateIds } },
      { $set: { "lineItems.$[line].itemId": keepId } },
      { arrayFilters: [{ "line.itemId": { $in: duplicateIds } }] },
    ).catch(() => null),
    db.collection("saleorders").updateMany(
      { tenantId, "lineItems.productId": { $in: duplicateIds } },
      { $set: { "lineItems.$[line].productId": keepId } },
      { arrayFilters: [{ "line.productId": { $in: duplicateIds } }] },
    ).catch(() => null),
    MigrationRecord.updateMany(
      { tenantId, targetRecordId: { $in: duplicateIds } },
      { $set: { targetRecordId: keepId } },
    ),
    MigrationIdentityMap.updateMany(
      { tenantId, targetId: { $in: duplicateIds } },
      { $set: { targetId: keepId } },
    ),
  ]);
}

export async function dedupeProductsForTenant(tenantId: string): Promise<DedupeResult> {
  const products = await Product.find({ tenantId })
    .select("_id header.name tab_general_information.default_code createdAt updatedAt")
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const groups = new Map<string, any[]>();
  for (const product of products) {
    const key = productDedupeKey(product);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(product);
  }

  let duplicateGroups = 0;
  let removed = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    duplicateGroups += 1;
    const keep = group[0];
    const latest = newest(group);
    const duplicateIds = group
      .filter((product) => String(product._id) !== String(keep._id))
      .map((product) => product._id as mongoose.Types.ObjectId);

    if (latest && String(latest._id) !== String(keep._id)) {
      const latestDoc = await Product.findById(latest._id).lean();
      if (latestDoc) {
        await Product.updateOne(
          { _id: keep._id, tenantId },
          {
            $set: {
              header: latestDoc.header,
              tab_general_information: latestDoc.tab_general_information,
              status: latestDoc.status,
            },
          },
        );
      }
    }

    await repointProductReferences(tenantId, duplicateIds, keep._id as mongoose.Types.ObjectId);
    const deleteResult = await Product.deleteMany({ tenantId, _id: { $in: duplicateIds } });
    removed += deleteResult.deletedCount || 0;
  }

  return { groups: duplicateGroups, removed };
}
