import mongoose from "mongoose";
import { headers } from "next/headers";
import connectDB from "./db";

// Tenant-aware database connection
export async function getTenantConnection() {
  await connectDB();

  // Get tenant ID from headers
  const headersList = await headers();
  const tenantId = headersList.get("x-tenant-id");

  if (!tenantId) {
    // throw new Error('No tenant ID found in request');
    // Fallback to default for non-tenant requests or during migration
    return createTenantModelHelper("default");
  }

  return createTenantModelHelper(tenantId);
}

function createTenantModelHelper(tenantId: string) {
  return {
    User: createTenantModel("User", tenantId),
    Organization: createTenantModel("Organization", tenantId),
    // Add other models as needed
    Invoice: createTenantModel("Invoice", tenantId),
    Vendor: createTenantModel("Vendor", tenantId),
    // We can expose a generic helper too
    model: (modelName: string) => createTenantModel(modelName, tenantId),
  };
}

// Helper to create tenant-specific queries
function createTenantModel(modelName: string, tenantId: string) {
  const Model = mongoose.models[modelName];

  if (!Model) {
    // Fallback or error. If model doesn't exist, it's a problem.
    // However, we might need to load it.
    // For now assume all models are loaded via connectDB (which they might not be if they are not imported)
    // Dynamic import might be needed if they are not global.
    throw new Error(`Model ${modelName} not found`);
  }

  // Override methods to include tenant filtering
  return {
    find: (conditions: any = {}) => Model.find({ ...conditions, tenantId }),
    findOne: (conditions: any) => Model.findOne({ ...conditions, tenantId }),
    findById: (id: any) => Model.findById(id).where({ tenantId }),
    create: (doc: any) => Model.create({ ...doc, tenantId }),
    updateOne: (filter: any, update: any) =>
      Model.updateOne({ ...filter, tenantId }, update),
    deleteOne: (filter: any) => Model.deleteOne({ ...filter, tenantId }),
    countDocuments: (filter: any) =>
      Model.countDocuments({ ...filter, tenantId }),
    // Expose raw model if needed, but risky
    _model: Model,
  };
}
