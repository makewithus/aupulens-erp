import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import Organization from "@/models/admin/Organization";

// Read-only seller-block info for the Sales invoice UI (org name, GSTIN,
// state — used client-side for the live CGST/SGST-vs-IGST preview).
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const org = await Organization.findOne({ subdomain: session.user.tenantId })
      .select("name settings.gstin settings.state settings.logo")
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        name: (org as any)?.name || "Your Company",
        gstin: (org as any)?.settings?.gstin,
        state: (org as any)?.settings?.state,
        logo: (org as any)?.settings?.logo,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
