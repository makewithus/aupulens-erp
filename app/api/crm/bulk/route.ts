import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import mongoose from "mongoose";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { generateExportData } from "@/lib/crm/exportEngine";

const getModel = (entityType: string) => {
  const map: Record<string, string> = {
    "Lead": "CrmLead", "Account": "CrmAccount", "Contact": "CrmContact",
    "Opportunity": "CrmOpportunity", "Case": "CrmCase", "Campaign": "CrmCampaign",
    "Contract": "CrmContract"
  };
  return mongoose.model(map[entityType] || entityType);
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();
  const { action, entityType, ids, payload } = body;
  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  if (!action || !entityType) {
    return NextResponse.json({ success: false, message: "Missing action or entityType" }, { status: 422 });
  }

  const Model = getModel(entityType);

  // If export action
  if (action === "export") {
    const { format, columns, query } = payload || {};
    try {
      const exportQuery = ids && ids.length > 0 ? { _id: { $in: ids } } : query;
      const data = await generateExportData(entityType, tenantId, exportQuery, format || "csv", columns);
      
      // We return base64 for xlsx buffer or direct string for csv
      if (format === "xlsx") {
        return NextResponse.json({ success: true, data: data.toString('base64'), isBase64: true });
      }
      return NextResponse.json({ success: true, data });
    } catch (e: any) {
      return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ success: false, message: "No records selected" }, { status: 422 });
  }

  let updateOp = {};
  if (action === "update") {
    updateOp = { $set: payload };
  } else if (action === "delete") {
    // Handle delete below
  } else {
    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  }

  if (action === "delete") {
    await Model.deleteMany({ _id: { $in: ids }, tenantId });
    // Write audit logs
    const logs = ids.map(id => ({
      tenantId, user_id: userId, action: "deleted", record_type: entityType, record_id: id, timestamp: new Date()
    }));
    await CrmAuditLog.insertMany(logs);
  } else if (action === "update") {
    await Model.updateMany({ _id: { $in: ids }, tenantId }, updateOp);
    // Write audit logs
    const logs = ids.map(id => ({
      tenantId, user_id: userId, action: "bulk_update", record_type: entityType, record_id: id, 
      new_value: JSON.stringify(payload), timestamp: new Date()
    }));
    await CrmAuditLog.insertMany(logs);
  }

  return NextResponse.json({ success: true, message: `Bulk ${action} successful on ${ids.length} records.` });
}
