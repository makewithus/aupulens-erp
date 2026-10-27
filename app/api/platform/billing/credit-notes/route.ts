import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import BillingCreditNote from "@/models/billing/BillingCreditNote";
import { verifyGlobalAdmin } from "@/lib/billing/adminAuth";

export async function GET(req: NextRequest) {
  const authResult = await verifyGlobalAdmin(req);
  if (!authResult.isAuthorized) {
    return NextResponse.json({ success: false, error: authResult.message }, { status: authResult.errorStatus || 403 });
  }
  try {
    await connectDB();
    const params = new URL(req.url).searchParams;
    const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));
    const page = Math.max(1, Number(params.get("page")) || 1);
    const tenantId = params.get("tenantId");
    const filter = tenantId ? { tenantId } : {};
    const [data, total] = await Promise.all([
      BillingCreditNote.find(filter).sort({ issuedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      BillingCreditNote.countDocuments(filter),
    ]);
    return NextResponse.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    return NextResponse.json({ success: false, error: "Credit notes could not be loaded." }, { status: 500 });
  }
}
