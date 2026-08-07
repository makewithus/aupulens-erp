import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Project from "@/models/Project";

async function getTenant() {
  const session = await auth();
  return (session?.user as any)?.tenantId as string | undefined;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenant();
  if (!tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const project = await Project.findOne({ _id: id, tenantId })
    .populate("ownerId", "name email")
    .populate("members", "name email")
    .lean();
  if (!project) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: project });
}

const EDITABLE = ["name", "description", "status", "priority", "progress", "startDate", "dueDate", "ownerId", "members"] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenant();
  if (!tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const project = await Project.findOne({ _id: id, tenantId });
  if (!project) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });

  const body = await req.json();
  for (const field of EDITABLE) {
    if (body[field] !== undefined) (project as any)[field] = body[field];
  }
  await project.save();
  return NextResponse.json({ success: true, data: project });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenant();
  if (!tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const project = await Project.findOneAndDelete({ _id: id, tenantId });
  if (!project) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
