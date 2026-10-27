import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const PHONE_RE = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;

function validEmail(value) {
  const email = String(value || "").trim();
  return !email || EMAIL_RE.test(email);
}

function validPhone(value) {
  const phone = String(value || "").trim();
  if (!phone) return true;
  const digits = phone.replace(/\D/g, "");
  return PHONE_RE.test(phone) && digits.length >= 7 && digits.length <= 15;
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 12000 });

try {
  await client.connect();
  const db = client.db();
  if (db.databaseName !== "aupulens-erp") {
    throw new Error(`Refusing database "${db.databaseName}"; expected "aupulens-erp"`);
  }

  const vendors = await db.collection("vendors").find({}).toArray();
  const plan = [];
  const blockers = [];
  let alreadyLinked = 0;

  for (const vendor of vendors) {
    if (!vendor.tenantId || !vendor.name?.trim()) {
      blockers.push("A vendor is missing its tenant or name.");
      continue;
    }
    if (!validEmail(vendor.contactEmail) || !validPhone(vendor.phone)) {
      blockers.push("A vendor has contact data that fails customer-master validation.");
      continue;
    }

    const customers = db.collection("customers");
    if (await customers.findOne({ tenantId: vendor.tenantId, legacyVendorId: vendor._id }, { projection: { _id: 1 } })) {
      alreadyLinked++;
      continue;
    }

    const tenantUsers = db.collection("users");
    const admin = await tenantUsers.findOne(
      { tenantId: vendor.tenantId, role: { $in: ["admin", "master-admin"] } },
      { projection: { _id: 1 }, sort: { createdAt: 1 } },
    );
    if (!admin?._id) {
      blockers.push("A vendor tenant has no admin user for migration attribution.");
      continue;
    }

    const email = String(vendor.contactEmail || "").trim().toLowerCase();
    const name = String(vendor.name).trim().toLowerCase();
    const tenantCustomers = await customers.find(
      { tenantId: vendor.tenantId },
      { projection: { _id: 1, isCustomer: 1, isSupplier: 1, header: 1, contact_details: 1 } },
    ).toArray();
    const emailMatches = email
      ? tenantCustomers.filter((customer) => String(customer.contact_details?.email || "").trim().toLowerCase() === email)
      : [];
    const nameMatches = tenantCustomers.filter((customer) =>
      [customer.header?.name, customer.header?.displayName]
        .some((value) => String(value || "").trim().toLowerCase() === name),
    );

    if (emailMatches.length > 1 || nameMatches.length > 1) {
      blockers.push("A vendor has multiple possible customer matches; manual identity mapping is required.");
      continue;
    }
    if (emailMatches.length === 1) {
      plan.push({ vendor, adminId: admin._id, existingCustomerId: emailMatches[0]._id });
    } else if (nameMatches.length > 0) {
      blockers.push("A vendor name matches a customer but the email does not; manual identity mapping is required.");
    } else {
      plan.push({ vendor, adminId: admin._id });
    }
  }

  const linked = plan.filter((row) => row.existingCustomerId).length;
  console.log(JSON.stringify({ database: db.databaseName, vendorsToMigrate: plan.length, suppliersToCreate: plan.length - linked, existingCustomersToMarkAsSuppliers: linked, alreadyLinked, blockers: blockers.length }));
  if (blockers.length) throw new Error("Migration stopped because vendor records need manual resolution.");
  if (process.argv.includes("--execute")) {
    await db.collection("customers").createIndex(
      { tenantId: 1, legacyVendorId: 1 },
      { unique: true, partialFilterExpression: { legacyVendorId: { $exists: true } } },
    );

    for (const { vendor, adminId, existingCustomerId } of plan) {
      const customers = db.collection("customers");
      if (existingCustomerId) {
        await customers.updateOne(
          { _id: existingCustomerId, tenantId: vendor.tenantId, legacyVendorId: { $exists: false } },
          { $set: { isSupplier: true, legacyVendorId: vendor._id, updatedAt: new Date() } },
        );
        continue;
      }

      const now = new Date();
      await customers.insertOne({
        _id: new ObjectId(),
        tenantId: vendor.tenantId,
        legacyVendorId: vendor._id,
        isSupplier: true,
        isCustomer: false,
        header: {
          name: String(vendor.name).trim(),
          displayName: String(vendor.name).trim(),
          companyName: String(vendor.name).trim(),
          is_company: true,
        },
        contact_details: {
          email: String(vendor.contactEmail || "").trim().toLowerCase(),
          phone: String(vendor.phone || "").trim(),
        },
        address_tab: { state_name: vendor.state || "" },
        currency: "INR",
        isActive: vendor.isActive !== false,
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const migrated = await db.collection("customers").countDocuments({ isSupplier: true, legacyVendorId: { $exists: true } });
    console.log(JSON.stringify({ migratedSupplierRecords: migrated }));
  }
} finally {
  await client.close();
}
