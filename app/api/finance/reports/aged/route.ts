import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import {
  buildAgedPartnerReport,
  type AgedReportType,
} from "@/lib/accounting/reports";

const agedReportTypes = new Set(["receivable", "payable"]);

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { searchParams } = new URL(req.url);
    const requestedType = searchParams.get("type") || "receivable";
    const asOf = searchParams.get("asOf");

    if (!agedReportTypes.has(requestedType)) {
      return NextResponse.json(
        { error: "type must be receivable or payable" },
        { status: 400 },
      );
    }

    const asOfDate = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(asOfDate.getTime())) {
      return NextResponse.json(
        { error: "asOf must be a valid date" },
        { status: 400 },
      );
    }

    await connectDB();

    const report = await buildAgedPartnerReport({
      tenantId,
      type: requestedType as AgedReportType,
      asOfDate,
    });

    return NextResponse.json(report);
  } catch (error: any) {
    console.error("Aged Report Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
