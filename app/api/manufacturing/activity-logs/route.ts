import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Shipment from "@/models/Shipment";
import CustomsClearance from "@/models/CustomsClearance";
import FreightProvider from "@/models/FreightProvider";
import HSCode from "@/models/HSCode";
import DocumentModel from "@/models/Document";

const ALLOWED_ROLES = ["manufacturing", "admin", "master-admin"];

/**
 * There's no dedicated audit-log table for manufacturing/logistics events —
 * this synthesizes a real, unified activity feed from the actual records
 * (their own createdAt timestamps) across Shipments, Customs Clearances,
 * Freight Providers, HS Codes, and Documents, sorted most-recent-first. Real
 * data from real collections, not a hardcoded placeholder list.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();
    const LIMIT = 20;
    const [shipments, clearances, providers, hsCodes, documents] = await Promise.all([
      Shipment.find({ tenantId }).sort({ createdAt: -1 }).limit(LIMIT).select("shipmentNumber customerName createdAt").lean(),
      CustomsClearance.find({ tenantId }).sort({ createdAt: -1 }).limit(LIMIT).select("clearanceNumber status createdAt").lean(),
      FreightProvider.find({ tenantId }).sort({ createdAt: -1 }).limit(LIMIT).select("providerName providerType createdAt").lean(),
      HSCode.find({ tenantId }).sort({ createdAt: -1 }).limit(LIMIT).select("hsCode category createdAt").lean(),
      DocumentModel.find({ tenantId, linked_record_type: "shipment" }).sort({ createdAt: -1 }).limit(LIMIT).select("name createdAt").lean(),
    ]);

    const activities = [
      ...shipments.map((s: any) => ({
        id: String(s._id),
        category: "shipment",
        action: "Shipment Created",
        description: `New shipment ${s.shipmentNumber} created${s.customerName ? ` for ${s.customerName}` : ""}`,
        timestamp: s.createdAt,
      })),
      ...clearances.map((c: any) => ({
        id: String(c._id),
        category: "customs",
        action: "Customs Clearance Updated",
        description: `Customs clearance ${c.clearanceNumber} is ${String(c.status || "draft").replace(/_/g, " ")}`,
        timestamp: c.createdAt,
      })),
      ...providers.map((p: any) => ({
        id: String(p._id),
        category: "provider",
        action: "Freight Provider Added",
        description: `New freight provider "${p.providerName}"${p.providerType ? ` (${p.providerType})` : ""} added to system`,
        timestamp: p.createdAt,
      })),
      ...hsCodes.map((h: any) => ({
        id: String(h._id),
        category: "hscode",
        action: "HS Code Created",
        description: `HS Code ${h.hsCode} added${h.category ? ` for ${h.category}` : ""}`,
        timestamp: h.createdAt,
      })),
      ...documents.map((d: any) => ({
        id: String(d._id),
        category: "document",
        action: "Document Uploaded",
        description: `"${d.name}" uploaded`,
        timestamp: d.createdAt,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 50);

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("Error building activity feed:", error);
    return NextResponse.json({ error: "Failed to load activity logs" }, { status: 500 });
  }
}
