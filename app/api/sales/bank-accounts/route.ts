import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import BankAccount from "@/models/BankAccount";

// Thin, read-only proxy onto the shared BankAccount model (owned by
// Finance > Accounting > Banking) so the Sales module can populate
// "Select Bank" without requiring Finance module access via middleware
// path-based module gating.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const accounts = await BankAccount.find({ tenantId: session.user.tenantId }).sort({ isPrimary: -1, accountName: 1 }).lean();
    return NextResponse.json({ success: true, data: accounts });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
