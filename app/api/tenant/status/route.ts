import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const subdomain = searchParams.get("subdomain");

    if (!subdomain || subdomain === "default" || subdomain === "default-tenant") {
      return NextResponse.json({
        isActive: true,
        name: "Aupulens",
        exists: true,
      });
    }

    await connectDB();
    const org = await Organization.findOne({
      subdomain: subdomain.toLowerCase(),
    }).select("isActive name");

    if (!org) {
      return NextResponse.json(
        { error: "Tenant not found", isActive: false, exists: false },
        { status: 404 },
      );
    }

    return NextResponse.json({
      isActive: org.isActive,
      name: org.name,
      exists: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error", isActive: false },
      { status: 500 },
    );
  }
}
