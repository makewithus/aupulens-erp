import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTenantId, getEffectiveTenantId } from "@/lib/auth/requireTenantId";
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
  const tenantId = getEffectiveTenantId(session);

  const url = new URL(req.url);
  const now = new Date();
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const useAi = url.searchParams.get("ai") === "true";

  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
    return NextResponse.json({ success: false, message: "Invalid calendar date range" }, { status: 400 });
  }
  let events;
  try {
    events = await getCalendarEvents(tenantId, role, from, to);
  } catch (error) {
    console.error("Calendar conflict aggregation failed:", error);
    return NextResponse.json({ success: false, message: "Calendar data is temporarily unavailable" }, { status: 503 });
  }
  const conflicts = detectConflicts(events);

  if (!useAi) {
    return NextResponse.json({ success: true, data: { conflicts, aiUsed: false } });
  }

  const insight = await prioritizeConflicts(tenantId, conflicts);
  return NextResponse.json({ success: true, data: { conflicts: insight.conflicts, summary: insight.summary, aiUsed: insight.aiUsed } });
}
