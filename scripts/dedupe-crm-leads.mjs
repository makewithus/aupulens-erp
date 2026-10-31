import "dotenv/config";
import { MongoClient } from "mongodb";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");

const normalizeText = (value) => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const normalizePhone = (value) => String(value ?? "").replace(/\D/g, "");

function identityKeys(lead) {
  const keys = [];
  const email = normalizeText(lead.email);
  const phone = normalizePhone(lead.phone);
  if (email) keys.push(`email:${email}`);
  if (phone.length >= 7) keys.push(`phone:${phone}`);
  if (!email && phone.length < 7) {
    const name = normalizeText(lead.lead_name);
    const company = normalizeText(lead.company_name);
    if (name && company) keys.push(`name-company:${name}|${company}`);
  }
  return keys;
}

function duplicateGroups(leads) {
  const parent = leads.map((_, i) => i);
  const find = (i) => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const seen = new Map();
  for (let i = 0; i < leads.length; i++) {
    for (const key of identityKeys(leads[i])) {
      const compound = `${leads[i].tenantId}:${key}`;
      if (seen.has(compound)) union(i, seen.get(compound));
      else seen.set(compound, i);
    }
  }
  const grouped = new Map();
  for (let i = 0; i < leads.length; i++) {
    const root = find(i);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(leads[i]);
  }
  return [...grouped.values()].filter((group) => group.length > 1);
}

function completeness(lead) {
  const fields = ["lead_name", "company_name", "email", "phone", "source", "owner_id", "status", "industry", "location", "interest_category", "service_product_interest", "budget_range", "expected_timeline", "notes", "converted_at", "converted_account_id", "converted_contact_id", "converted_opportunity_id"];
  return fields.reduce((count, field) => count + (lead[field] !== undefined && lead[field] !== null && lead[field] !== "" ? 1 : 0), 0)
    + (Array.isArray(lead.tags) ? lead.tags.length : 0)
    + Math.min(String(lead.notes ?? "").length, 1000) / 1000;
}

function mergeGroup(group) {
  const ranked = [...group].sort((a, b) => completeness(b) - completeness(a)
    || new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0)
    || String(a._id).localeCompare(String(b._id)));
  const keeper = ranked[0];
  const merged = {};
  for (const field of ["company_name", "email", "phone", "source", "owner_id", "industry", "location", "interest_category", "service_product_interest", "budget_range", "expected_timeline", "priority", "notes", "converted_at", "converted_account_id", "converted_contact_id", "converted_opportunity_id"]) {
    const value = ranked.find((lead) => lead[field] !== undefined && lead[field] !== null && lead[field] !== "")?.[field];
    if (value !== undefined) merged[field] = value;
  }
  const latest = [...group].sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0))[0];
  if (latest.status) merged.status = latest.status;
  merged.lead_score = Math.max(...group.map((lead) => Number(lead.lead_score) || 0));
  merged.tags = [...new Set(group.flatMap((lead) => Array.isArray(lead.tags) ? lead.tags : []))];
  const emails = group.map((lead) => normalizeText(lead.email)).filter(Boolean);
  const phones = group.map((lead) => normalizePhone(lead.phone)).filter((phone) => phone.length >= 7);
  merged.emailNormalized = emails[0] || undefined;
  merged.phoneNormalized = phones[0] || undefined;
  return { keeper, merged, duplicates: ranked.slice(1) };
}

async function main() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db();
  const leadsCollection = db.collection("crmleads");
  try {
    const leads = await leadsCollection.find({}).toArray();
    const groups = duplicateGroups(leads);
    const duplicateRows = groups.reduce((sum, group) => sum + group.length - 1, 0);
    const indexes = await leadsCollection.indexes();
    const perTenant = new Map();
    for (const group of groups) {
      const tenant = String(group[0].tenantId ?? "unknown");
      perTenant.set(tenant, (perTenant.get(tenant) ?? 0) + group.length - 1);
    }
    console.log(`${apply ? "APPLY" : "DRY RUN"}: ${leads.length} lead rows, ${groups.length} duplicate groups, ${duplicateRows} duplicate rows to remove.`);
    console.log(`Normalized identity indexes: email=${indexes.some((index) => index.name === "uniq_crm_lead_tenant_email_normalized") ? "ready" : "missing"}, phone=${indexes.some((index) => index.name === "uniq_crm_lead_tenant_phone_normalized") ? "ready" : "missing"}.`);
    for (const [tenant, count] of perTenant) console.log(`Tenant ${tenant}: ${count} duplicate rows`);
    if (!apply || !duplicateRows) return;

    const archiveName = "crmleaddeduparchive";
    if (!(await db.listCollections({ name: archiveName }).hasNext())) {
      await db.createCollection(archiveName);
    }
    const archive = db.collection(archiveName);
    await archive.createIndex({ originalLeadId: 1 }, { unique: true, name: "uniq_archived_crm_lead_id" });

    const activities = db.collection("crmactivities");
    const tasks = db.collection("crmtasks");
    const opportunities = db.collection("crmopportunities");
    const documents = db.collection("crmdocuments");
    const session = client.startSession();
    try {
      for (const group of groups) {
        const { keeper, merged, duplicates } = mergeGroup(group);
        await session.withTransaction(async () => {
          const now = new Date();
          await archive.insertMany(duplicates.map((lead) => ({
            tenantId: lead.tenantId,
            originalLeadId: lead._id,
            duplicateOf: keeper._id,
            archivedAt: now,
            record: lead,
          })), { session });

          await leadsCollection.updateOne(
            { _id: keeper._id, tenantId: keeper.tenantId },
            { $set: merged },
            { session },
          );
          for (const duplicate of duplicates) {
            const filter = { tenantId: duplicate.tenantId };
            await activities.updateMany({ ...filter, linked_lead_id: duplicate._id }, { $set: { linked_lead_id: keeper._id } }, { session });
            await tasks.updateMany({ ...filter, linked_lead_id: duplicate._id }, { $set: { linked_lead_id: keeper._id } }, { session });
            await opportunities.updateMany({ ...filter, lead_id: duplicate._id }, { $set: { lead_id: keeper._id } }, { session });
            await documents.updateMany({ ...filter, linked_record_type: "Lead", linked_record_id: duplicate._id }, { $set: { linked_record_id: keeper._id } }, { session });
            await leadsCollection.deleteOne({ _id: duplicate._id, tenantId: duplicate.tenantId }, { session });
          }
        });
      }
    } finally {
      await session.endSession();
    }

    // Backfill normalized keys before adding unique indexes. The partial
    // indexes also allow records without an email or phone.
    const remaining = await leadsCollection.find({}, { projection: { _id: 1, tenantId: 1, email: 1, phone: 1 } }).toArray();
    if (remaining.length) {
      await leadsCollection.bulkWrite(remaining.map((lead) => {
        const email = normalizeText(lead.email);
        const phone = normalizePhone(lead.phone);
        return {
          updateOne: {
            filter: { _id: lead._id },
            update: { $set: {
              emailNormalized: email || null,
              phoneNormalized: phone.length >= 7 ? phone : null,
            } },
          },
        };
      }), { ordered: false });
    }
    await leadsCollection.createIndex(
      { tenantId: 1, emailNormalized: 1 },
      { unique: true, name: "uniq_crm_lead_tenant_email_normalized", partialFilterExpression: { emailNormalized: { $type: "string" } } },
    );
    await leadsCollection.createIndex(
      { tenantId: 1, phoneNormalized: 1 },
      { unique: true, name: "uniq_crm_lead_tenant_phone_normalized", partialFilterExpression: { phoneNormalized: { $type: "string" } } },
    );
    console.log(`Removed ${duplicateRows} duplicate lead rows. Duplicate records are retained in ${archiveName}; CRM references now point to the surviving leads.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Lead deduplication failed:", error.message);
  process.exitCode = 1;
});
