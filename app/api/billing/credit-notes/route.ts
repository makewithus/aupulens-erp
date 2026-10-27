import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BillingCreditNote from "@/models/billing/BillingCreditNote";

export async function GET(req: NextRequest) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    await connectDB();
    const params = new URL(req.url).searchParams;
    const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));
    const page = Math.max(1, Number(params.get("page")) || 1);
    const filter = { tenantId };
    const [data, total] = await Promise.all([
      BillingCreditNote.find(filter).sort({ issuedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      BillingCreditNote.countDocuments(filter),
    ]);
    return NextResponse.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    return NextResponse.json({ success: false, error: "Credit notes could not be loaded." }, { status: 500 });
  }
}
