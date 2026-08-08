import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { studioCatalog } from "@/lib/studio/catalog";

// GET /api/studio/catalog — trigger/action/operator vocabulary for the builder.
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  return NextResponse.json({ success: true, data: studioCatalog() });
}
