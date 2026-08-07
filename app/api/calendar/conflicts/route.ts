import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { getCalendarEvents, detectConflicts } from "@/lib/calendar/aggregateEvents";
import { prioritizeConflicts } from "@/lib/calendar/conflictInsight";

/**
 * AI-assisted calendar conflict detection (6.5). Deterministic detection over
 * the unified events, then an optional AI prioritisation (?ai=true).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;
  const role = ((session.user as any).role || "").toLowerCase();

  const url = new URL(req.url);
  const now = new Date();
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const useAi = url.searchParams.get("ai") === "true";

  const events = await getCalendarEvents(session.user.tenantId, role, from, to);
  const conflicts = detectConflicts(events);

  if (!useAi) {
    return NextResponse.json({ success: true, data: { conflicts, aiUsed: false } });
  }

  const insight = await prioritizeConflicts(session.user.tenantId, conflicts);
  return NextResponse.json({ success: true, data: { conflicts: insight.conflicts, summary: insight.summary, aiUsed: insight.aiUsed } });
}
