import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runUniversalSearch } from "@/lib/search/universalSearch";

/**
 * Universal Enterprise Search (Phase 6.1) — now a thin wrapper over the shared
 * lib/search/universalSearch helper so the app-wide header search box and the
 * AI Command Center's "search data" intent run the exact same role-scoped,
 * cross-module query. (Semantic ranking is layered on in Scope G.)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const role = ((session!.user as any).role || "").toLowerCase();

  const term = new URL(req.url).searchParams.get("q") || "";
  const results = await runUniversalSearch(tenantId, role, term);
  return NextResponse.json({ success: true, data: results });
}
