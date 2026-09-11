import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import RetentionPolicy from "@/models/platform/RetentionPolicy";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability, requireCapability, AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY, PLATFORM_EVENT_CATEGORY, PLATFORM_EVENT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  if (!(await hasCapability(actor, ADMIN_CAPABILITY.VIEW_AUDIT_LOGS))) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  await connectDB();
  const policies = await RetentionPolicy.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json({
    success: true,
    data: policies.map((p) => ({
      id: String(p._id),
      organizationType: p.organizationType,
      country: p.country,
      eventCategory: p.eventCategory,
      eventType: p.eventType,
      retentionDays: p.retentionDays,
      isDefault: p.isDefault,
    })),
  });
}

export async function POST(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.retentionDays) {
    return NextResponse.json({ success: false, message: "retentionDays is required." }, { status: 400 });
  }

  try {
    await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_RETENTION_POLICY);
    await connectDB();
    const policy = await RetentionPolicy.create({
      organizationType: body.organizationType,
      country: body.country,
      eventCategory: body.eventCategory,
      eventType: body.eventType,
      retentionDays: body.retentionDays,
      isDefault: Boolean(body.isDefault),
    });

    await emitPlatformAuditEvent({
      actor,
      eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
      eventType: PLATFORM_EVENT_TYPE.RETENTION_POLICY_APPLIED,
      severity: PLATFORM_SEVERITY.INFO,
      entityType: "RetentionPolicy",
      entityId: String(policy._id),
      newValue: { retentionDays: policy.retentionDays, organizationType: policy.organizationType, eventCategory: policy.eventCategory },
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });

    return NextResponse.json({ success: true, data: { id: String(policy._id) } }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}
