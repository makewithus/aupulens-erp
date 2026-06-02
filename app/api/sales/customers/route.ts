import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";
    const customers = await Customer.find({
      tenantId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ items: customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const body = await request.json();

    if (!body.header?.name) {
      return NextResponse.json(
        { error: "Customer name is required" },
        { status: 400 },
      );
    }

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

    const customer = await Customer.create({
      ...body,
      tenantId: session.user.tenantId || "default-tenant",
      createdBy: session.user.id,
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    console.error("Error creating customer:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
