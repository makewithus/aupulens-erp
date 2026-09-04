import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import AiMetricSnapshot from "@/models/ai/AiMetricSnapshot";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { canManageOrg } from "@/lib/org/rbac";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { listWorkflows } from "@/lib/aiRuntime/runtime/registry";
import { computeAndPersistTenantMetrics } from "@/lib/aiRuntime/metrics/computeMetrics";

/**
 * Performance tab (docs/ai/BRIEF-08b-FINAL.md C.1) — same admin-only gate as the Policy tab
 * (`app/api/finance/ai-operations/policy/route.ts`), same "read, seeding what's missing" shape.
 *
 * **The evidence-bar check here is a generic, documented default** (`overrideRate < 0.1` over
 * `>= 20` samples) — not a per-workflow-tuned threshold. `docs/ai/AUTONOMY_RUNBOOK.md` is where
 * the REAL per-workflow bars are reasoned about qualitatively; this numeric proxy is what the UI
 * can check automatically today without a second config surface for thresholds no workflow-owner
 * has actually set yet.
 */
const DEFAULT_OVERRIDE_RATE_BAR = 0.1;
const DEFAULT_MIN_SAMPLE = 20;

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

    let snapshots = await AiMetricSnapshot.find({ tenantId }).sort({ snapshotDate: -1 }).lean();
    if (snapshots.length === 0) {
      // First view for this tenant — compute once synchronously rather than showing an empty
      // page until the nightly cron gets to it (same "seed on first read" precedent as Policy).
      await computeAndPersistTenantMetrics(tenantId);
      snapshots = await AiMetricSnapshot.find({ tenantId }).sort({ snapshotDate: -1 }).lean();
    }

    const latestByWorkflow = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots) {
      if (!latestByWorkflow.has(s.workflowId)) latestByWorkflow.set(s.workflowId, s);
    }

    const policies = await AiWorkflowPolicy.find({ tenantId }).select("workflowId maxAutonomyLevel killSwitchEnabled").lean();
    const policyByWorkflow = new Map(policies.map((p) => [p.workflowId, p]));

    const rows = workflows.map((w) => {
      const snap = latestByWorkflow.get(w.id);
      const policy = policyByWorkflow.get(w.id);
      const meetsDefaultBar = Boolean(snap && snap.metrics.overrideRate !== null && snap.metrics.overrideRate < DEFAULT_OVERRIDE_RATE_BAR && snap.metrics.overrideSampleSize >= DEFAULT_MIN_SAMPLE);
      return {
        workflowId: w.id,
        defaultAutonomy: w.defaultAutonomy,
        currentMaxAutonomy: policy?.maxAutonomyLevel ?? null,
        killSwitchEnabled: policy?.killSwitchEnabled ?? false,
        metrics: snap?.metrics ?? null,
        notComputable: snap?.notComputable ?? [],
        snapshotDate: snap?.snapshotDate ?? null,
        meetsDefaultBar,
      };
    });

    return NextResponse.json({ rows, evidenceBar: { overrideRate: DEFAULT_OVERRIDE_RATE_BAR, minSample: DEFAULT_MIN_SAMPLE } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
