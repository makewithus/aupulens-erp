import { NextResponse } from "next/server";

/** Only tenant administrators and finance staff may change billing or authorize charges. */
export function requireBillingOperator(user: { role?: string } | null | undefined) {
  if (user?.role === "admin" || user?.role === "finance") return null;
  return NextResponse.json({ success: false, error: "Billing administrator access is required." }, { status: 403 });
}
