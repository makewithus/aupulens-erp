import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BankFeedProvider from "@/models/BankFeedProvider";

/**
 * Initiates a live bank-feed connection for the given provider.
 *
 * This is intentionally NOT a fake success response: automatic bank feeds
 * require a registered agreement with a licensed aggregator (e.g. an
 * Account Aggregator / Perfios / Yodlee-style provider) and real client
 * credentials. Until BANK_FEED_AGGREGATOR_CLIENT_ID /
 * BANK_FEED_AGGREGATOR_CLIENT_SECRET are configured in the environment,
 * this honestly reports that live feeds aren't configured yet instead of
 * pretending a connection succeeded. Once real credentials are supplied,
 * this is the single place to wire in the actual OAuth/consent redirect.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const { providerId } = await req.json();
    if (!providerId || !mongoose.isValidObjectId(providerId)) {
      return NextResponse.json({ success: false, message: "A valid providerId is required" }, { status: 400 });
    }

    const provider = await BankFeedProvider.findById(providerId).lean();
    if (!provider) return NextResponse.json({ success: false, message: "Provider not found" }, { status: 404 });

    const clientId = process.env.BANK_FEED_AGGREGATOR_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        {
          success: false,
          code: "PROVIDER_NOT_CONFIGURED",
          message: `Live bank feeds for ${provider.name} aren't configured yet. Add BANK_FEED_AGGREGATOR_CLIENT_ID / BANK_FEED_AGGREGATOR_CLIENT_SECRET to enable automatic feeds, or add this account manually in the meantime.`,
        },
        { status: 501 },
      );
    }

    // Real integration point once credentials exist: initiate the
    // provider's OAuth/consent flow here and return the redirect URL.
    return NextResponse.json({ success: false, message: "Provider connection not yet implemented" }, { status: 501 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
