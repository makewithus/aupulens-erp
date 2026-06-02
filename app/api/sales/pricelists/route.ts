import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Pricelist from "@/models/Pricelist";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";

    const items = await Pricelist.find({
      tenantId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching pricelists:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "Pricelist name is required" },
        { status: 400 },
      );
    }

    const item = await Pricelist.create({
      ...body,
      tenantId: session.user.tenantId || "default-tenant",
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Error creating pricelist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
