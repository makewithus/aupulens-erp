import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const customer = await Customer.findOne({
      _id: id,
      tenantId,
    }).lean();

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("Error fetching customer:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();
    const body = await request.json();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    // Sanitize body to remove empty strings or "default" for ObjectId fields
    if (
      body.sales_purchase_tab?.user_id === "default" ||
      body.sales_purchase_tab?.user_id === ""
    ) {
      if (body.sales_purchase_tab) {
        body.sales_purchase_tab.user_id = undefined;
      }
    }

    if (body.accounting_tab?.property_account_receivable_id === "") {
      if (body.accounting_tab) {
        body.accounting_tab.property_account_receivable_id = undefined;
      }
    }

    if (body.accounting_tab?.property_account_payable_id === "") {
      if (body.accounting_tab) {
        body.accounting_tab.property_account_payable_id = undefined;
      }
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true, runValidators: true },
    );

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    await safeEmitEvent(tenantId, "master_data.changed", { model: "Customer", id: String(customer._id), tenantId });

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("Error updating customer:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const customer = await Customer.findOneAndDelete({
      _id: id,
      tenantId,
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error("Error deleting customer:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
