import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import Customer from "@/models/sales/Customer";
import { stripProtectedFields } from "@/lib/api/validateId";
import mongoose from "mongoose";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id || id === "undefined" || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid supplier ID" }, { status: 400 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const supplier = await Customer.findOne({ _id: id, tenantId, isSupplier: true }).lean();
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: supplier });
  } catch (error) {
    console.error("Error fetching supplier:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id || id === "undefined" || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid supplier ID" }, { status: 400 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const body = stripProtectedFields(await request.json());
    const supplier = await Customer.findOne({ _id: id, tenantId, isSupplier: true });
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    if (body.name || body.displayName || body.header?.name || body.header?.displayName) {
      const name = (body.name || body.displayName || body.header?.name || body.header?.displayName).trim();
      supplier.header.name = name;
      supplier.header.displayName = (body.displayName || body.header?.displayName || name).trim();
    }
    if (body.email !== undefined) supplier.contact_details.email = body.email;
    if (body.phone !== undefined) supplier.contact_details.phone = body.phone;
    if (body.gstin !== undefined) supplier.gstin = body.gstin;
    if (body.pan !== undefined) supplier.pan = body.pan;
    if (body.isCustomer !== undefined) supplier.isCustomer = !!body.isCustomer;
    if (body.isActive !== undefined) supplier.isActive = !!body.isActive;
    if (body.address_tab) supplier.address_tab = { ...supplier.address_tab, ...body.address_tab };
    if (body.accounting_tab) supplier.accounting_tab = { ...supplier.accounting_tab, ...body.accounting_tab };

    await supplier.save();
    return NextResponse.json({ success: true, item: supplier });
  } catch (error: any) {
    console.error("Error updating supplier:", error);
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id || id === "undefined" || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid supplier ID" }, { status: 400 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const supplier = await Customer.findOne({ _id: id, tenantId, isSupplier: true });
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    if (supplier.isCustomer) {
      // Dual-role entity: revoke supplier role without deleting the customer record
      supplier.isSupplier = false;
      await supplier.save();
      return NextResponse.json({ success: true, message: "Supplier role removed" });
    } else {
      await Customer.deleteOne({ _id: id, tenantId });
      return NextResponse.json({ success: true, message: "Supplier deleted" });
    }
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
