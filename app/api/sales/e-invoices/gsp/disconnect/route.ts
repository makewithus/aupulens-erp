import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import EinvoiceGspCredential from "@/models/sales/EinvoiceGspCredential";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    await EinvoiceGspCredential.deleteOne({ tenantId: session.user.tenantId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("GSP disconnect POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
