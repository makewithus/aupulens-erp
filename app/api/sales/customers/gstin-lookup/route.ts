import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { lookupGstin } from "@/lib/sales/gstinLookup";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const gstin = new URL(request.url).searchParams.get("gstin") || "";
  const result = await lookupGstin(gstin);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
