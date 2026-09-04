import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { canManageOrg } from "@/lib/org/rbac";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { listWorkflows } from "@/lib/aiRuntime/runtime/registry";

/**
 * Policy tab — read + seed (docs/ai/BRIEF-05-BATCH-D.md Task 0.1/0.2). Restricted to
 * admin/master-admin via the EXISTING lib/org/rbac.ts (no "finance-owner" role exists in this
 * codebase — confirmed by repo-wide search — so the brief's "admin/finance-owner" language maps
 * onto the two real elevated roles canManageOrg() already checks).
 *
 * The seed (0.2) creates one AiWorkflowPolicy row per currently-registered workflow, at that
 * workflow's own declared `defaultAutonomy` ceiling, with killSwitchEnabled: false, the first
 * time this route is hit for a tenant with a missing row. Reads `listWorkflows()` — the runtime
 * registry itself — rather than a hand-maintained duplicate table, so the seed can never drift
 * out of sync with what a workflow actually declares.
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

    bootstrapAiRuntime();
    const workflows = listWorkflows().filter((w) => w.id !== "AI-00-SMOKE");

    const existing = await AiWorkflowPolicy.find({ tenantId }).lean();
    const existingIds = new Set(existing.map((p) => p.workflowId));

    const toSeed = workflows.filter((w) => !existingIds.has(w.id));
    if (toSeed.length > 0) {
      await AiWorkflowPolicy.insertMany(
        toSeed.map((w) => ({
          tenantId,
          workflowId: w.id,
          maxAutonomyLevel: w.defaultAutonomy,
          killSwitchEnabled: false,
        })),
        { ordered: false },
      );
    }

    const policies = toSeed.length > 0 ? await AiWorkflowPolicy.find({ tenantId }).lean() : existing;

    return NextResponse.json({
      policies,
      workflows: workflows.map((w) => ({ id: w.id, defaultAutonomy: w.defaultAutonomy, actionClass: w.actionClass })),
      seeded: toSeed.map((w) => w.id),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
