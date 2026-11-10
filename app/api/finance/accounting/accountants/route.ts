import { NO_STORE_HEADERS } from "@/lib/api/noStore";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Accountant from "@/models/finance/Accountant";
import { requireTenantId } from "@/lib/auth/requireTenantId";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    await connectDB();

    // Check if seeded
    const count = await Accountant.countDocuments();
    if (count === 0) {
      const { seedNewChartOfAccounts } = await import("@/lib/accounting/coa-feature-seeder");
      await seedNewChartOfAccounts(session.user.tenantId as string, session.user.id);
    }

    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const state = searchParams.get("state");
    
    let query: any = {};
    if (country && country !== "All") query.country = country;
    if (state && state !== "All") query.state = state;

    const accountants = await Accountant.find(query).sort({ name: 1 }).lean();
    return NextResponse.json(
      { accountants },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Accountant GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
