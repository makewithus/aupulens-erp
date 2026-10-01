import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationRecord from "@/models/admin/MigrationRecord";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  
  // Get records with status "duplicate"
  const duplicates = await MigrationRecord.find({ 
    batchId: id, 
    tenantId: session.user.tenantId,
    status: "duplicate"
  }).limit(50).lean();

  return NextResponse.json({ success: true, data: duplicates });
}
