import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Lead from "@/models/Lead";
import {
  LEAD_STATUS,
  LEAD_STATUS_VALUES,
  normalizeProbability,
} from "@/lib/crm/workflow";
import {
  hasCrmAccess,
  normalizeFollowUps,
  normalizeNotes,
  normalizeOptionalEmail,
  normalizeOptionalString,
} from "@/lib/crm/api";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session || !hasCrmAccess(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId || "default-tenant";
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const ownerId = searchParams.get("ownerId");
    const query = searchParams.get("q");

    await connectDB();

    const filter: Record<string, any> = { tenantId };
    if (status) {
      const statuses = status.split(",").filter((value) =>
        LEAD_STATUS_VALUES.includes(value as any),
      );
      if (statuses.length) filter.status = { $in: statuses };
    }
    if (ownerId) filter.ownerId = ownerId;
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: "i" } },
        { companyName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ];
    }

    const items = await Lead.find(filter)
      .sort({ updatedAt: -1 })
      .populate("ownerId", "name email")
      .populate("convertedOpportunityId", "name stage amount")
      .populate("convertedCustomerId", "header.name contact_details.email")
      .lean();

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("CRM leads GET error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || !hasCrmAccess(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId || "default-tenant";
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Lead name is required" },
        { status: 400 },
      );
    }

    await connectDB();

    const lead = await Lead.create({
      tenantId,
      name: String(body.name).trim(),
      companyName: normalizeOptionalString(body.companyName),
      email: normalizeOptionalEmail(body.email),
      phone: normalizeOptionalString(body.phone),
      source: normalizeOptionalString(body.source),
      status: body.status || LEAD_STATUS.NEW,
      score: normalizeProbability(body.score),
      estimatedValue: Number(body.estimatedValue) || 0,
      expectedCloseDate: body.expectedCloseDate
        ? new Date(body.expectedCloseDate)
        : undefined,
      ownerId: body.ownerId || session.user.id,
      notes: normalizeNotes(body.notes, session.user.id),
      followUps: normalizeFollowUps(body.followUps),
      createdBy: session.user.id,
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error: any) {
    console.error("CRM leads POST error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
