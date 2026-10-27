/** Restore missing business records; never updates existing records or login/config data.
 * Preview: node scripts/restore-seeded-workspace.cjs
 * Apply:   node scripts/restore-seeded-workspace.cjs --apply
 */
require('dotenv/config');
const { MongoClient } = require('mongodb');

const COLLECTIONS = [
  'accounts', 'accounttypes', 'bankaccounts', 'customers', 'vendors', 'products',
  'taxrates', 'warehouses', 'stocks', 'stockmoves', 'stocktransfers',
  'purchaseorders', 'salesquotations', 'saleorders', 'salesinvoices', 'payments',
  'invoices', 'journalentries', 'subscriptions', 'dunningrules', 'einvoices',
  'billofmaterials', 'manufacturingorders', 'departments', 'employees',
  'attendances', 'leaverequests', 'payrolls', 'crmaccounts', 'crmleads',
  'crmopportunities', 'crmactivities', 'crmcontacts', 'crmtasks', 'projects',
  'invoicetemplates', 'customfields', 'salesviews', 'documentprefixes', 'counters',
];

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const target = client.db();
    const source = client.db('aupulens-erp');
    const tenantId = 'default-tenant';
    if (target.databaseName === source.databaseName) throw new Error('Source and target must differ');
    const plan = [];
    // Finish every preflight check before inserting any data.
    for (const name of COLLECTIONS) {
      const docs = await source.collection(name).find({ tenantId }).toArray();
      const existing = await target.collection(name).find({ tenantId }, { projection: { _id: 1 } }).toArray();
      const ids = new Set(existing.map(doc => String(doc._id)));
      const missing = docs.filter(doc => !ids.has(String(doc._id)));
      if (existing.length && missing.length) throw new Error(`Refusing to merge a populated workspace collection: ${name}`);
      if (missing.length) {
        const collision = await target.collection(name).findOne({ _id: { $in: missing.map(doc => doc._id) } });
        if (collision) throw new Error(`Cross-workspace identifier collision: ${name}`);
        plan.push({ name, docs: missing });
      }
    }
    console.log(JSON.stringify({ source: source.databaseName, target: target.databaseName, tenantId,
      apply: process.argv.includes('--apply'), collections: plan.map(p => ({ name: p.name, insert: p.docs.length })) }));
    if (!process.argv.includes('--apply')) return;
    for (const { name, docs } of plan) {
      const result = await target.collection(name).bulkWrite(docs.map(doc => ({ updateOne: {
        filter: { _id: doc._id, tenantId }, update: { $setOnInsert: doc }, upsert: true,
      } })), { ordered: true });
      if (result.modifiedCount) throw new Error(`Unexpected existing-record change: ${name}`);
      const count = await target.collection(name).countDocuments({ _id: { $in: docs.map(doc => doc._id) }, tenantId });
      if (count !== docs.length) throw new Error(`Restoration verification failed: ${name}`);
      console.log(JSON.stringify({ collection: name, inserted: result.upsertedCount, verified: count }));
    }
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
