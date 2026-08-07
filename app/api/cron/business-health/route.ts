import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import { generateBusinessHealthSummary } from "@/lib/ai/businessHealth";

// Same CRON_SECRET bearer-check shape as the other cron routes. Scheduled via
// vercel.json (repo root). Generates a per-tenant AI business-health summary
// over live finance/sales data. GET (Vercel Cron sends GET) + POST both work.
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const orgs = await Organization.find({ isActive: true }, "subdomain").lean();

  const results = [];
  for (const org of orgs) {
    results.push(await generateBusinessHealthSummary((org as any).subdomain));
  }

  return NextResponse.json({ success: true, results });
}

export { handler as GET, handler as POST };
