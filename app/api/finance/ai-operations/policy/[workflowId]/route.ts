import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { canManageOrg } from "@/lib/org/rbac";
import { AI_AUTONOMY_LEVEL_ORDER } from "@/lib/constants/statuses";

/**
 * Updates one workflow's policy row (docs/ai/BRIEF-05-BATCH-D.md Task 0.1) — admin-gated, same
 * as the list route. `maxAutonomyLevel` may only be set to a real, tenant-configurable level
 * (AI_AUTONOMY_LEVEL_ORDER — NEVER_AUTONOMOUS is excluded there by design: it is a hard,
 * non-configurable ceiling the gate itself enforces, never a value an operator can select).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageOrg(session)) return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const { workflowId } = await params;
    const body = await req.json();

    const update: Record<string, unknown> = {};

    if (body.maxAutonomyLevel !== undefined) {
      if (!AI_AUTONOMY_LEVEL_ORDER.includes(body.maxAutonomyLevel)) {
        return NextResponse.json({ error: `maxAutonomyLevel must be one of: ${AI_AUTONOMY_LEVEL_ORDER.join(", ")}` }, { status: 400 });
      }
      update.maxAutonomyLevel = body.maxAutonomyLevel;
    }
    if (typeof body.killSwitchEnabled === "boolean") update.killSwitchEnabled = body.killSwitchEnabled;
    if (typeof body.autoPostSchedules === "boolean") update.autoPostSchedules = body.autoPostSchedules;
    if (body.materialityThreshold !== undefined) {
      const n = Number(body.materialityThreshold);
      update.materialityThreshold = Number.isFinite(n) && n >= 0 ? n : undefined;
    }
    if (body.confidenceThreshold !== undefined) {
      const n = Number(body.confidenceThreshold);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return NextResponse.json({ error: "confidenceThreshold must be between 0 and 1" }, { status: 400 });
      }
      update.confidenceThreshold = n;
    }
    if (body.historicalStabilityThreshold !== undefined) {
      const n = Number(body.historicalStabilityThreshold);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return NextResponse.json({ error: "historicalStabilityThreshold must be between 0 and 1" }, { status: 400 });
      }
      update.historicalStabilityThreshold = n;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "no recognized fields in body" }, { status: 400 });
    }

    const policy = await AiWorkflowPolicy.findOneAndUpdate(
      { tenantId, workflowId },
      { $set: update },
      { new: true, upsert: false },
    );

    if (!policy) return NextResponse.json({ error: "policy row not found — visit the Policy tab to seed it first" }, { status: 404 });

    return NextResponse.json({ policy });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
