import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import { canManageOrg } from "@/lib/org/rbac";

/**
 * Compliance profile — Policy tab (docs/ai/BRIEF-06-BATCH-E.md A.2). `AiComplianceProfile` is
 * the one `models/ai/**` model no AI workflow may ever write — human-entered only, structurally
 * (no registered tool exists for it, asserted in `tests/ai/aiRuntime/ai12TaxIntelligence.test.ts`).
 * This route is that one legitimate write path: a direct human edit, same class as the plain
 * attention resolve/snooze route — never routed through the AI runtime's tool layer.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageOrg(session)) return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const profile = await AiComplianceProfile.findOne({ tenantId }).lean();
    return NextResponse.json({ profile: profile ?? { tenantId, registrations: [], obligations: [], thresholds: [] } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canManageOrg(session)) return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const body = await req.json();
    const registrations = Array.isArray(body.registrations) ? body.registrations : [];
    const obligations = Array.isArray(body.obligations) ? body.obligations : [];
    const thresholds = Array.isArray(body.thresholds) ? body.thresholds : [];

    const profile = await AiComplianceProfile.findOneAndUpdate(
      { tenantId },
      { $set: { registrations, obligations, thresholds } },
      { upsert: true, new: true, runValidators: true },
    );

    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
