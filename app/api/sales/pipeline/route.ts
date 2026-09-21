export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { listDeals } from "@/lib/sales/pipelineDeals";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const deals = await listDeals(session.user.tenantId);
    return NextResponse.json({ success: true, items: deals });
  } catch (error) {
    console.error("Pipeline GET error:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load the pipeline right now. Please refresh and try again." },
      { status: 500 },
    );
  }
}
