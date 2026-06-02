import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";
import SaleOrder from "@/models/SaleOrder";
import User from "@/models/User";
import { requireMaintenanceAccess } from "@/lib/api/maintenance-guard";

export async function GET() {
  const guard = await requireMaintenanceAccess();
  if (guard.error) return guard.error;

  await connectDB();
  try {
    const indexes = await Invoice.collection.indexes();
    const results = [];

    if (indexes.find((i) => i.name === "invoiceNumber_1")) {
      await Invoice.collection.dropIndex("invoiceNumber_1");
      results.push("Dropped invoiceNumber_1");
    }

    const userIndexes = await User.collection.indexes();
    if (userIndexes.find((i) => i.name === "email_1")) {
      await User.collection.dropIndex("email_1");
      results.push("Dropped legacy global users.email index");
    }

    if (userIndexes.find((i) => i.name === "employeeId_1")) {
      await User.collection.dropIndex("employeeId_1");
      results.push("Dropped legacy global users.employeeId index");
    }

    await User.collection.createIndex(
      { tenantId: 1, email: 1 },
      { unique: true, name: "tenantId_1_email_1" },
    );
    results.push("Ensured tenant-scoped users.email index");

    await User.collection.createIndex(
      { tenantId: 1, employeeId: 1 },
      {
        unique: true,
        name: "tenantId_1_employeeId_1",
        partialFilterExpression: {
          employeeId: { $exists: true, $type: "string" },
        },
      },
    );
    results.push("Ensured tenant-scoped users.employeeId index");

    const saleOrderIndexes = await SaleOrder.collection.indexes();
    if (saleOrderIndexes.find((i) => i.name === "header.name_1")) {
      await SaleOrder.collection.dropIndex("header.name_1");
      results.push("Dropped legacy global saleOrders.header.name index");
    }

    await SaleOrder.collection.createIndex(
      { tenantId: 1, "header.name": 1 },
      { unique: true, name: "tenantId_1_header.name_1" },
    );
    results.push("Ensured tenant-scoped saleOrders.header.name index");

    return NextResponse.json({
      message: "Index Check Complete",
      changes: results,
      current: {
        invoices: indexes,
        users: userIndexes,
        saleOrders: saleOrderIndexes,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
