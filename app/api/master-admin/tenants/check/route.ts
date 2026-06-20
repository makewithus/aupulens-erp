import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "master-admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subdomain = searchParams.get("subdomain");

    if (!subdomain) {
      return NextResponse.json(
        { error: "Subdomain is required" },
        { status: 400 },
      );
    }

    await connectDB();

    const existingOrg = await Organization.findOne({
          subdomain: subdomain.toLowerCase(),
        }).lean();
    const isAvailable = !existingOrg;

    let suggestions: string[] = [];
    if (!isAvailable) {
      // Generate 3 suggestions
      const base = subdomain.toLowerCase();
      const options = [
        `${base}erp`,
        `${base}-cloud`,
        `${base}-official`,
        `${base}123`,
        `${base}-hq`,
      ];

      for (const opt of options) {
        const taken = await Organization.findOne({ subdomain: opt }).lean();
        if (!taken) {
          suggestions.push(opt);
        }
        if (suggestions.length >= 3) break;
      }
    }

    return NextResponse.json(
      { available: isAvailable, suggestions },
      { status: 200 },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}
