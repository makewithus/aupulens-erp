/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS maintenance command. */
/**
 * Reconcile duplicate-key failures caused by overlapping migration workers.
 * Dry-run by default. --apply only repairs migration metadata when the matching
 * target exists, matches the imported values, and is recorded by this batch's job.
 * No customer, account, invoice, payment, or other business record is modified.
 */
const { loadEnvConfig } = require('@next/env');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('node:fs');

async function main() {
  loadEnvConfig(process.cwd());
  const batchId = process.argv.find(arg => /^[a-f0-9]{24}$/i.test(arg));
  if (!batchId) throw new Error('Pass a batch ObjectId and optionally --apply');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    const batch = await db.collection('migrationbatches').findOne({ _id: new ObjectId(batchId) });
    if (!batch || !['completed', 'failed', 'verified'].includes(batch.status)) throw new Error('Batch must be completed or failed');
    const filter = { batchId: batch._id, tenantId: batch.tenantId };
    const jobs = await db.collection('migrationjobs').find(filter).toArray();
    const records = await db.collection('migrationrecords').find({ ...filter, status: 'failed' }).toArray();
    if (!records.length) {
      console.log(JSON.stringify({ batchId, status: batch.status, migrated: batch.summary?.migrated, failed: batch.summary?.failed, verification: batch.summary?.verification }));
      return;
    }
    const configs = {
      account: { collection: 'accounts', source: 'accountCode', target: 'accountCode', fields: { accountName: 'accountName' } },
      salesInvoice: { collection: 'salesinvoices', source: 'number', target: 'number', fields: { totalAmount: 'totalAmount' }, date: ['invoiceDate', 'invoiceDate'] },
      payment: { collection: 'payments', source: 'sourceId', target: 'paymentNumber', fields: { amount: 'amountReceived' }, date: ['date', 'paymentDate'] },
    };
    const repairs = [];
    const unresolved = [];
    for (const [entityType, config] of Object.entries(configs)) {
      const rows = records.filter(record => record.entityType === entityType);
      const keys = rows.map(record => record.mappedData?.[config.source]).filter(Boolean);
      const targets = await db.collection(config.collection).find({ tenantId: batch.tenantId, [config.target]: { $in: keys } }).toArray();
      const byKey = new Map(targets.map(target => [String(target[config.target]), target]));
      for (const record of rows) {
        const data = record.mappedData || {};
        const target = byKey.get(String(data[config.source]));
        const job = jobs.find(job => String(job._id) === String(record.jobId));
        const owned = target && job?.importedRefs?.some(ref => String(ref.id) === String(target._id));
        const matches = target && Object.entries(config.fields).every(([source, dest]) => {
          if (data[source] === undefined || data[source] === '') return false;
          return typeof target[dest] === 'number'
            ? Number(String(data[source]).replace(/,/g, '')) === target[dest]
            : String(data[source]).trim() === String(target[dest]);
        });
        const dateMatches = !config.date || (data[config.date[0]] && target && new Date(data[config.date[0]]).getTime() === new Date(target[config.date[1]]).getTime());
        const duplicateError = JSON.stringify(record.errors).includes('duplicate record');
        if (owned && matches && dateMatches && duplicateError) {
          repairs.push({ record, targetId: target._id, jobId: record.jobId, entityType });
        } else unresolved.push({ id: record._id, entityType, owned: !!owned, matches: !!matches, dateMatches: !!dateMatches });
      }
    }
    unresolved.push(...records.filter(record => !configs[record.entityType]).map(record => ({ id: record._id, entityType: record.entityType })));
    console.log(JSON.stringify({ batchId, failed: records.length, safelyReconciled: repairs.length, unresolved: unresolved.length, details: unresolved.slice(0, 5) }));
    if (!process.argv.includes('--apply')) return;
    if (!repairs.length || unresolved.length) throw new Error('Refusing a partial or unverified recovery');
    const backupPath = `/tmp/migration-recovery-${batchId}-${Date.now()}.json`;
    fs.writeFileSync(backupPath, JSON.stringify({ batch, records }, null, 2), { mode: 0o600 });
    await db.collection('migrationrecords').bulkWrite(repairs.map(({ record, targetId }) => ({ updateOne: {
      filter: { ...filter, _id: record._id, status: 'failed' },
      update: { $set: { status: 'migrated', targetRecordId: targetId, errors: [], updatedAt: new Date() } },
    } })));
    // Repair source-reference links only after the real target has been verified.
    const identities = [];
    for (const repair of repairs) {
      const data = repair.record.mappedData;
      const aliases = repair.entityType === 'account' ? [data.sourceId, data.accountName, data.accountCode]
        : repair.entityType === 'salesInvoice' ? [data.sourceId, data.number] : [data.sourceId, data.reference];
      for (const sourceId of new Set(aliases.filter(Boolean))) identities.push({ updateOne: {
        filter: { ...filter, entityType: repair.entityType, sourceId },
        update: { $set: { targetId: repair.targetId } }, upsert: true,
      } });
    }
    if (identities.length) await db.collection('migrationidentitymaps').bulkWrite(identities);
    const counts = await db.collection('migrationrecords').aggregate([
      { $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray();
    const count = status => counts.find(item => item._id === status)?.count || 0;
    const verification = batch.summary?.verification;
    if (verification?.sourceVsTarget) {
      for (const row of verification.sourceVsTarget) {
        const entityRows = await db.collection('migrationrecords').find({ ...filter, entityType: row.entity }).toArray();
        row.targetCount = entityRows.filter(record => ['migrated', 'skipped'].includes(record.status)).length;
        row.failedCount = entityRows.filter(record => record.status === 'failed').length;
        const config = configs[row.entity];
        if (config) row.actualTargetCount = await db.collection(config.collection).countDocuments({ tenantId: batch.tenantId, _id: { $in: entityRows.map(record => record.targetRecordId).filter(Boolean) } });
        row.status = row.targetCount === row.sourceCount && row.failedCount === 0 && row.orphanCount === 0 ? 'PASS' : 'FAIL';
      }
      verification.status = verification.sourceVsTarget.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
    }
    await db.collection('migrationbatches').updateOne({ _id: batch._id, tenantId: batch.tenantId, status: batch.status }, { $set: {
      'summary.migrated': count('migrated') + count('skipped'), 'summary.failed': count('failed'),
      ...(verification ? { 'summary.verification': verification } : {}),
      status: verification?.status === 'PASS' ? 'verified' : 'completed', updatedAt: new Date(),
    } });
    console.log(JSON.stringify({ recovered: repairs.length, counts, backupPath }));
  } finally { await client.close(); }
}

main().catch(error => { console.error(error.name + ': ' + error.message.replace(/mongodb\S*/g, '[redacted]')); process.exitCode = 1; });
