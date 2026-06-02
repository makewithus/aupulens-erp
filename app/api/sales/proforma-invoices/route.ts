import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ProformaInvoice from "@/models/ProformaInvoice";

export async function GET() {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const items = await ProformaInvoice.find({ tenantId })
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching pro forma invoices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const body = await request.json();

    if (
      !body.piNumber ||
      !body.customer ||
      !body.items ||
      body.items.length === 0
    ) {
      return NextResponse.json(
        { error: "PI number, customer, and at least one item are required" },
        { status: 400 },
      );
    }

    await connectDB();
    const proforma = await ProformaInvoice.create(body);

    return NextResponse.json({ proforma }, { status: 201 });
  } catch (error) {
    console.error("Error creating proforma invoice:", error);
    if ((error as any).code === 11000) {
      return NextResponse.json(
        { error: "PI number already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
