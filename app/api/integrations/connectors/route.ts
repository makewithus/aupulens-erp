import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectorCatalog } from "@/lib/integrations/registry";

// GET /api/integrations/connectors — the available connector catalog (metadata
// only, no secrets). Auth-gated so it's not an open enumeration endpoint.
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  return NextResponse.json({ success: true, data: connectorCatalog() });
}
