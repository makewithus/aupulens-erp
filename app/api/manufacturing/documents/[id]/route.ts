import { validateObjectId } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import DocumentModel from "@/models/manufacturing/Document";

const ALLOWED_ROLES = ["manufacturing", "admin", "master-admin"];

// Records a download (increments download_count) and returns the file URL to
// redirect to — keeps the counter accurate without the client managing it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;

    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;
    await connectDB();
    const wantsDownload = req.nextUrl.searchParams.get("download") === "1";
    const wantsPreview = req.nextUrl.searchParams.get("preview") === "1";
    const doc = wantsDownload
      ? await DocumentModel.findOneAndUpdate(
          { _id: id, tenantId },
          { $inc: { download_count: 1 } },
          { new: true },
        ).lean()
      : await DocumentModel.findOne({ _id: id, tenantId }).lean();
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    if (wantsDownload || wantsPreview) {
      let fileUrl: URL;
      try {
        fileUrl = new URL(doc.file_url);
      } catch {
        return NextResponse.json({ error: "Invalid document URL" }, { status: 502 });
      }
      const cloudName = process.env.NEXT_PUBLIC_CLOUD_NAME;
      if (
        fileUrl.protocol !== "https:" ||
        fileUrl.hostname !== "res.cloudinary.com" ||
        !cloudName ||
        fileUrl.pathname.split("/")[1] !== cloudName
      ) {
        return NextResponse.json({ error: "Document download is unavailable" }, { status: 502 });
      }

      const fileResponse = await fetch(fileUrl, { cache: "no-store" });
      if (!fileResponse.ok || !fileResponse.body) {
        return NextResponse.json({ error: "Failed to retrieve document file" }, { status: 502 });
      }
      const safeName = String(doc.name || "document").replace(/[\\"\r\n]/g, "_");
      const safeDispositionName = encodeURIComponent(doc.name || "document");
      const headers = new Headers({
        "Content-Type": doc.file_type || fileResponse.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `${wantsDownload ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${safeDispositionName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      const contentLength = fileResponse.headers.get("content-length");
      if (contentLength) headers.set("Content-Length", contentLength);
      return new Response(fileResponse.body, { status: 200, headers });
    }

    return NextResponse.json({ document: doc });
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json({ error: "Failed to fetch document" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;

    await connectDB();
    const doc = await DocumentModel.findOneAndDelete({ _id: id, tenantId });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
