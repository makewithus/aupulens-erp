import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { requirePermission } from "@/lib/crm/rbac";
import CrmApprovalPolicy from "@/models/crm/ApprovalPolicy";

/**
 * Configurable multi-step approval policies (6.3). GET lists this tenant's
 * policies; POST creates/replaces the active policy for an entity. Gated by
 * manage_workflows (same permission as the automation builders).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;
  try { requirePermission(session, "manage_workflows"); } catch (e: any) { return NextResponse.json({ success: false, message: e.message }, { status: 403 }); }

  await dbConnect();
  const policies = await CrmApprovalPolicy.find({ tenantId: session.user.tenantId }).sort({ updatedAt: -1 }).lean();
  return NextResponse.json({ success: true, data: policies });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;
  try { requirePermission(session, "manage_workflows"); } catch (e: any) { return NextResponse.json({ success: false, message: e.message }, { status: 403 }); }

  const body = await req.json();
  const entity = body.entity || "Quote";
  const name = (body.name || "").trim();
  const steps = Array.isArray(body.steps) ? body.steps : [];

  if (!name) return NextResponse.json({ success: false, message: "Policy name is required" }, { status: 400 });
  if (steps.length === 0) return NextResponse.json({ success: false, message: "Add at least one approval step" }, { status: 400 });

  // Validate + normalize steps.
  const normalized = steps
    .map((s: any, i: number) => ({
      order: typeof s.order === "number" ? s.order : i + 1,
      approverRole: String(s.approverRole || "").trim(),
      minAvgDiscountPercent: s.minAvgDiscountPercent != null && s.minAvgDiscountPercent !== "" ? Number(s.minAvgDiscountPercent) : undefined,
      minAmount: s.minAmount != null && s.minAmount !== "" ? Number(s.minAmount) : undefined,
      label: s.label ? String(s.label) : undefined,
    }))
    .filter((s: any) => s.approverRole);

  if (normalized.length === 0) return NextResponse.json({ success: false, message: "Each step needs an approver role" }, { status: 400 });

  await dbConnect();
  // One active policy per entity: disable any existing active policy for this entity first.
  await CrmApprovalPolicy.updateMany(
    { tenantId: session.user.tenantId, entity, enabled: true },
    { $set: { enabled: false } },
  );

  const policy = await CrmApprovalPolicy.create({
    tenantId: session.user.tenantId,
    entity,
    name,
    enabled: body.enabled !== false,
    steps: normalized,
    createdBy: session.user.id,
  });

  return NextResponse.json({ success: true, data: policy });
}
