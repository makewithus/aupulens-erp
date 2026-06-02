import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import Opportunity from "@/models/Opportunity";
import {
  OPPORTUNITY_STAGE,
  OPPORTUNITY_STAGE_VALUES,
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
    const stage = searchParams.get("stage");
    const ownerId = searchParams.get("ownerId");
    const customerId = searchParams.get("customerId");
    const query = searchParams.get("q");

    await connectDB();

    const filter: Record<string, any> = { tenantId };
    if (stage) {
      const stages = stage.split(",").filter((value) =>
        OPPORTUNITY_STAGE_VALUES.includes(value as any),
      );
      if (stages.length) filter.stage = { $in: stages };
    }
    if (ownerId) filter.ownerId = ownerId;
    if (customerId) filter.customerId = customerId;
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: "i" } },
        { companyName: { $regex: query, $options: "i" } },
        { contactName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ];
    }

    const items = await Opportunity.find(filter)
      .sort({ updatedAt: -1 })
      .populate("ownerId", "name email")
      .populate("sourceLeadId", "name companyName email")
      .populate("customerId", "header.name contact_details.email")
      .lean();

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("CRM opportunities GET error:", error);
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
        { error: "Opportunity name is required" },
        { status: 400 },
      );
    }

    await connectDB();

    if (body.customerId) {
      const customer = await Customer.exists({
        _id: body.customerId,
        tenantId,
      });
      if (!customer) {
        return NextResponse.json(
          { error: "Customer not found for this tenant" },
          { status: 404 },
        );
      }
    }

    const opportunity = await Opportunity.create({
      tenantId,
      name: String(body.name).trim(),
      companyName: normalizeOptionalString(body.companyName),
      contactName: normalizeOptionalString(body.contactName),
      email: normalizeOptionalEmail(body.email),
      phone: normalizeOptionalString(body.phone),
      amount: Number(body.amount) || 0,
      probability: normalizeProbability(body.probability),
      stage: body.stage || OPPORTUNITY_STAGE.QUALIFICATION,
      expectedCloseDate: body.expectedCloseDate
        ? new Date(body.expectedCloseDate)
        : undefined,
      sourceLeadId: body.sourceLeadId || undefined,
      customerId: body.customerId || undefined,
      ownerId: body.ownerId || session.user.id,
      notes: normalizeNotes(body.notes, session.user.id),
      followUps: normalizeFollowUps(body.followUps),
      createdBy: session.user.id,
    });

    return NextResponse.json({ opportunity }, { status: 201 });
  } catch (error: any) {
    console.error("CRM opportunities POST error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
