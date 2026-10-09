import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { findHsnSacReference, lookupHsnSac, normalizeProductType } from "@/lib/tax/hsnData";
import { checkRateLimit } from "@/lib/middleware/rateLimit";

const MAX_DESCRIPTION_LENGTH = 1000;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const limited = checkRateLimit(req, "/api/tax/hsn-sac-lookup", session.user?.id);
    if (limited) return limited;
    
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;

    const body = await req.json();
    const description = String(body.description || "").trim();
    if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json({ error: "Description is too long" }, { status: 400 });
    }

    const type = normalizeProductType(body.productType || body.type);
    if ((body.productType || body.type) && !type) {
      return NextResponse.json({ error: "Invalid product type. Use goods or service." }, { status: 400 });
    }

    const lookup = lookupHsnSac(description, type);
    if (!lookup.selected) {
      return NextResponse.json({ error: "No matching HSN/SAC found in reference data." }, { status: 404 });
    }

    const reference = findHsnSacReference(lookup.selected.code, type);
    if (!reference) {
      return NextResponse.json({ error: "Reference lookup failed" }, { status: 500 });
    }

    return NextResponse.json({
      code: reference.code,
      type: reference.type,
      description: reference.description,
      gstRate: reference.gstRate,
      gstTreatment: reference.gstTreatment,
      confidence: lookup.confidence,
      reviewRequired: lookup.reviewRequired,
      source: {
        sourceId: reference.sourceId,
        effectiveDate: reference.effectiveDate,
        description: reference.description,
      },
      candidates: lookup.candidates.map((candidate) => ({
        code: candidate.code,
        type: candidate.type,
        description: candidate.description,
        gstRate: candidate.gstRate,
        gstTreatment: candidate.gstTreatment,
        score: candidate.score,
        matchedTokens: candidate.matchedTokens,
        sourceId: candidate.sourceId,
        effectiveDate: candidate.effectiveDate,
      })),
    });
  } catch (error: any) {
    console.error("Error in HSN lookup:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
