export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { transitionDeal, DealError } from "@/lib/sales/pipelineDeals";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const { kind, id, to } = await request.json();
    if (!id || !to || (kind !== "order" && kind !== "quote")) {
      return NextResponse.json({ success: false, error: "Missing deal or target stage." }, { status: 400 });
    }
    await connectDB();
    const result = await transitionDeal({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      kind,
      id,
      to,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof DealError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Pipeline transition error:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't move this deal. Please try again." },
      { status: 500 },
    );
  }
}
