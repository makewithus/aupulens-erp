import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runCombinedSearch } from "@/lib/search/universalSearch";

/**
 * Universal Enterprise Search (Phase 6.1) — a thin wrapper over the shared
 * lib/search/universalSearch helper so the app-wide header search box and the
 * AI Command Center's "search data" intent run the exact same role-scoped,
 * cross-module query.
 *
 * Scope G: pass `?semantic=true` to layer embedding-based semantic hits on top
 * of the keyword baseline (keyword always runs, so results never regress when
 * embeddings are off/unindexed).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const role = ((session!.user as any).role || "").toLowerCase();

  const url = new URL(req.url);
  const term = url.searchParams.get("q") || "";
  const semantic = url.searchParams.get("semantic") === "true";

  const { results, semanticUsed } = await runCombinedSearch(tenantId, role, term, { semantic });
  return NextResponse.json({ success: true, data: results, semanticUsed });
}
