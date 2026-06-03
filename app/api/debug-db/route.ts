import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Organization from "@/models/Organization";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    
    // Count orgs and users
    const orgsCount = await Organization.countDocuments({});
    const usersCount = await User.countDocuments({});
    
    // Get sample admin emails
    const admins = await User.find({ role: "admin" }).select("email tenantId").limit(5);

    // Get the database host (safe part of URI)
    const rawUri = process.env.MONGODB_URI || "";
    const safeUri = rawUri.replace(/:([^@]+)@/, ":xxxxxx@");

    return NextResponse.json({
      success: true,
      connected: true,
      safeUri,
      orgsCount,
      usersCount,
      sampleAdmins: admins,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      connected: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}
