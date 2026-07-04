import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import EinvoiceGspCredential from "@/models/EinvoiceGspCredential";
import { GSP_CONNECTION_STATUS } from "@/lib/constants/statuses";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const credential = await EinvoiceGspCredential.findOne({ tenantId: session.user.tenantId })
      .select("provider username status connectedAt lastError")
      .lean();

    return NextResponse.json({
      success: true,
      data: credential || { status: GSP_CONNECTION_STATUS.NOT_CONNECTED },
    });
  } catch (error: any) {
    console.error("GSP status GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
