import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Project from "@/models/shared/Project";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";

const ALLOWED_ROLES = ["project", "admin", "master-admin"];

async function getAuthContext() {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  return { session, tenantId, role };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const { tenantId, role } = await getAuthContext();
    if (!tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (role && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    await connectDB();
    const project = await Project.findOne({ _id: id, tenantId })
      .populate("ownerId", "name email")
      .populate("members", "name email")
      .lean();
    if (!project) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    return handleRouteError(error);
  }
}

const EDITABLE = ["name", "description", "status", "priority", "progress", "startDate", "dueDate", "ownerId", "members"] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const { tenantId, role } = await getAuthContext();
    if (!tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (role && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    await connectDB();
    const project = await Project.findOne({ _id: id, tenantId });
    if (!project) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });

    const body = await req.json();
    for (const field of EDITABLE) {
      if (body[field] !== undefined) (project as any)[field] = body[field];
    }
    await project.save();
    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const { tenantId, role } = await getAuthContext();
    if (!tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (role && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    await connectDB();
    const project = await Project.findOneAndDelete({ _id: id, tenantId });
    if (!project) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
