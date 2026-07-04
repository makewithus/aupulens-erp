import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import EinvoiceGspCredential, { DEFAULT_GSP_PROVIDER } from "@/models/EinvoiceGspCredential";
import { encrypt } from "@/lib/crypto";
import { getGspService } from "@/lib/einvoice/gspService";
import { GSP_CONNECTION_STATUS } from "@/lib/constants/statuses";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();
    const provider = body.provider || DEFAULT_GSP_PROVIDER;
    const username = (body.username || "").trim();
    const password = body.password || "";

    if (!username) {
      return NextResponse.json({ success: false, message: "GSP Username is required" }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ success: false, message: "GSP Password is required" }, { status: 400 });
    }

    const validation = await getGspService().validateCredentials({ provider, username, password });
    if (!validation.ok) {
      await EinvoiceGspCredential.findOneAndUpdate(
        { tenantId },
        {
          tenantId,
          provider,
          username,
          encryptedPassword: encrypt(password),
          status: GSP_CONNECTION_STATUS.FAILED,
          lastError: validation.error,
          createdBy: session.user.id,
        },
        { upsert: true, new: true },
      );
      return NextResponse.json(
        { success: false, message: validation.error || "GSP credentials could not be verified" },
        { status: 422 },
      );
    }

    const credential = await EinvoiceGspCredential.findOneAndUpdate(
      { tenantId },
      {
        tenantId,
        provider,
        username,
        encryptedPassword: encrypt(password),
        status: GSP_CONNECTION_STATUS.CONNECTED,
        connectedAt: new Date(),
        lastError: undefined,
        createdBy: session.user.id,
      },
      { upsert: true, new: true },
    ).select("provider username status connectedAt");

    return NextResponse.json({ success: true, data: credential });
  } catch (error: any) {
    console.error("GSP connect POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
