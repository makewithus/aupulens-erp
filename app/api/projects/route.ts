import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Project from "@/models/shared/Project";
import { PROJECT_STATUS_VALUES } from "@/lib/constants/statuses";
import { getCachedData, setCachedData, invalidateCache } from "@/lib/api/serverCache";
import { paginateKeyset, parsePageRequest } from "@/lib/api/pagination";

export async function GET(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const ALLOWED_ROLES = ["project", "admin", "master-admin"];
  if (!session?.user?.role || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, message: "Forbidden: Access denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";

  // Opt-in cursor pagination (?limit=&cursor=). Without those params the complete legacy response is
  // returned unchanged, so existing consumers (dashboard KPIs, list page) keep working until migrated.
  const pageReq = parsePageRequest(searchParams);
  if (pageReq.requested && "error" in pageReq) {
    return NextResponse.json({ success: false, message: pageReq.error }, { status: 400 });
  }

  const cacheKey = `projects-list:${tenantId}:${status}`;
  const cached = pageReq.requested ? null : getCachedData<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  await connectDB();

  const query: any = { tenantId };
  if (status && (PROJECT_STATUS_VALUES as readonly string[]).includes(status)) query.status = status;

  if (pageReq.requested && "limit" in pageReq) {
    const { items, page } = await paginateKeyset(Project, query, pageReq, { field: "createdAt", direction: -1 });
    return NextResponse.json({ success: true, data: items, pagination: page });
  }

  const projects = await Project.find(query).sort({ createdAt: -1 }).lean();
  const payload = { success: true, data: projects };
  setCachedData(cacheKey, payload, 20_000);
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const ALLOWED_ROLES = ["project", "admin", "master-admin"];
  if (!session?.user?.role || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, message: "Forbidden: Access denied" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ success: false, message: "Project name is required" }, { status: 400 });
  }

  const project = await Project.create({
    tenantId,
    name: String(body.name).trim(),
    description: body.description,
    status: body.status,
    priority: body.priority,
    progress: body.progress,
    startDate: body.startDate ? new Date(body.startDate) : new Date(),
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    ownerId: body.ownerId || (session!.user as any).id,
    members: body.members || [],
    createdBy: (session!.user as any).id,
  });

  invalidateCache(`projects-list:${tenantId}`);
  return NextResponse.json({ success: true, data: project }, { status: 201 });
}
