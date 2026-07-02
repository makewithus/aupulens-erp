import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Accountant from "@/models/Accountant";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    
    // Check if seeded
    const count = await Accountant.countDocuments();
    if (count === 0) {
      const { seedNewChartOfAccounts } = await import("@/lib/accounting/coa-feature-seeder");
      await seedNewChartOfAccounts(session.user.tenantId || "default-tenant", session.user.id);
    }

    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const state = searchParams.get("state");
    
    let query: any = {};
    if (country && country !== "All") query.country = country;
    if (state && state !== "All") query.state = state;

    const accountants = await Accountant.find(query).sort({ name: 1 });
    return NextResponse.json({ accountants });
  } catch (error) {
    console.error("Accountant GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
