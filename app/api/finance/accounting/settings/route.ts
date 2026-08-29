import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AccountingSettings from "@/models/finance/AccountingSettings";

const ALLOWED_SECTIONS = ["chartOfAccounts", "journals", "currency", "taxSettings", "tds"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const tenantId = session.user.tenantId;

  let settings = await AccountingSettings.findOne({ tenantId }).lean();
  if (!settings) {
    const created = await AccountingSettings.create({ tenantId, createdBy: session.user.id });
    settings = created.toObject();
  }

  return NextResponse.json({ success: true, data: settings });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();
    const update: Record<string, unknown> = {};
    for (const section of ALLOWED_SECTIONS) {
      if (body[section] && typeof body[section] === "object") {
        for (const [k, v] of Object.entries(body[section])) {
          update[`${section}.${k}`] = v;
        }
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, message: "No valid settings provided" }, { status: 400 });
    }

    const doc = await AccountingSettings.findOneAndUpdate(
      { tenantId: session.user.tenantId },
      { $set: update, $setOnInsert: { createdBy: session.user.id } },
      { new: true, upsert: true, runValidators: true },
    );
    return NextResponse.json({ success: true, data: doc });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
