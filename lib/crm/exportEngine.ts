import { Parser } from "@json2csv/plainjs";
import * as xlsx from "xlsx";
import dbConnect from "@/lib/db";
import mongoose from "mongoose";

// Map entity types to their Mongoose models dynamically
const getModel = (entityType: string) => {
  const map: Record<string, string> = {
    "Leads": "CrmLead",
    "Accounts": "CrmAccount",
    "Contacts": "CrmContact",
    "Opportunities": "CrmOpportunity",
    "Cases": "CrmCase",
    "Campaigns": "CrmCampaign",
    "Contracts": "CrmContract"
  };
  return mongoose.model(map[entityType] || entityType);
};

export async function generateExportData(
  entityType: string, 
  tenantId: string, 
  query: any = {}, 
  format: "csv" | "xlsx",
  columns?: string[]
) {
  await dbConnect();
  const Model = getModel(entityType);

  const finalQuery = { ...query, tenantId };

  // For very large datasets, lean() and streaming/cursor might be necessary.
  // Here we use lean() with projection.
  let findQuery = Model.find(finalQuery).lean();

  if (columns && columns.length > 0) {
    const projection: Record<string, number> = {};
    columns.forEach(c => projection[c] = 1);
    findQuery = findQuery.select(projection);
  }

  const data = await findQuery.exec();

  // Format objects (e.g. converting nested objects or ObjectIds to strings)
  const flattenedData = data.map((doc: any) => {
    const flat: any = { ...doc };
    delete flat._id;
    delete flat.__v;
    delete flat.tenantId;
    return flat;
  });

  if (format === "csv") {
    const parser = new Parser({});
    const csv = parser.parse(flattenedData);
    return csv; // Returns a string
  }

  if (format === "xlsx") {
    const worksheet = xlsx.utils.json_to_sheet(flattenedData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, entityType);
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    return buffer; // Returns a Buffer
  }

  throw new Error("Invalid format");
}
