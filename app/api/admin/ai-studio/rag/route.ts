import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { indexTenantDocuments, ragQuery } from "@/lib/ai/rag";

/**
 * AI Studio scoped RAG (Scope E). Admin-only.
 *   POST { action: "index" }            → (re)build this tenant's knowledge base.
 *   POST { action: "query", question }  → grounded answer over the tenant's data.
 * All retrieval is tenant-scoped to the caller's own workspace.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });
  if (session!.user.role !== "admin" && session!.user.role !== "master-admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (body.action === "index") {
    const result = await indexTenantDocuments(tenantId);
    if (!result.embeddingConfigured) {
      return NextResponse.json({ success: false, message: "Embeddings are not configured (AZURE_OPENAI_EMBEDDING_DEPLOYMENT)." }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result });
  }

  if (body.action === "query") {
    const answer = await ragQuery(tenantId, body.question || "");
    if (!answer.ok) {
      return NextResponse.json({ success: false, message: answer.error, gated: answer.gated }, { status: answer.gated ? 403 : 400 });
    }
    return NextResponse.json({ success: true, data: answer });
  }

  return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
}
