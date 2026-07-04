import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import { DocumentSettings } from "@/models/DocumentSettings";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    
    let settings = await (DocumentSettings as any).findOne({ tenantId: session.user.tenantId }).lean();
    
    if (!settings) {
      // Create defaults if they don't exist
      const newSettings = new DocumentSettings({ tenantId: session.user.tenantId });
      await newSettings.save();
      settings = newSettings.toObject();
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    console.error("Document Settings GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    
    // Security: ensure tenantId isn't overridden
    delete data.tenantId;

    const settings = await (DocumentSettings as any).findOneAndUpdate(
      { tenantId: session.user.tenantId },
      { $set: data },
      { new: true, upsert: true }
    ).lean();

    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    console.error("Document Settings PATCH error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
