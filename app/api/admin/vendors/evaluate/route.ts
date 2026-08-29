import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Vendor from "@/models/admin/Vendor";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { vendorId } = await request.json();
    await connectDB();

    const vendor = await Vendor.findOne({ _id: vendorId, tenantId });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    // Fetch other vendors in the same category for context
    const escapedCategory = vendor.category.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const categoryRegex = new RegExp(`^${escapedCategory}$`, "i");
    const peerVendors = await Vendor.find({
      tenantId,
      category: categoryRegex,
      _id: { $ne: vendor._id },
    }).select("name performanceMetrics");

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API Key missing" },
        { status: 500 },
      );
    }

    // Format peer data for the prompt
    const peersList = peerVendors
      .map(
        (p) =>
          `- ${p.name}: Delivery ${p.performanceMetrics.deliveryTime}d, Quality ${p.performanceMetrics.qualityScore}/10, Cost ${p.performanceMetrics.costRating}/10`,
      )
      .join("\n");

    // Calculate category stats (keep for reference)
    const peers = peerVendors.map((v) => v.performanceMetrics);
    const avgDelivery =
      peers.length > 0
        ? peers.reduce((acc, p) => acc + p.deliveryTime, 0) / peers.length
        : vendor.performanceMetrics.deliveryTime;
    const avgQuality =
      peers.length > 0
        ? peers.reduce((acc, p) => acc + p.qualityScore, 0) / peers.length
        : vendor.performanceMetrics.qualityScore;
    const avgCost =
      peers.length > 0
        ? peers.reduce((acc, p) => acc + p.costRating, 0) / peers.length
        : vendor.performanceMetrics.costRating;

    const prompt = `
      Analyze this vendor (${vendor.name}) in the context of the "${
        vendor.category
      }" category.
      
      Target Vendor Metrics:
      - Delivery Time: ${
        vendor.performanceMetrics.deliveryTime
      } days (Lower is better)
      - Quality Score: ${
        vendor.performanceMetrics.qualityScore
      }/10 (Higher is better)
      - Cost Rating: ${
        vendor.performanceMetrics.costRating
      }/10 (Higher means cheaper/better value)

      Peer Vendors in "${vendor.category}":
      ${peersList || "No other vendors in this category."}

      Category Averages:
      - Avg Delivery: ${avgDelivery.toFixed(1)} days
      - Avg Quality: ${avgQuality.toFixed(1)}/10
      - Avg Cost: ${avgCost.toFixed(1)}/10

      Task:
      1. Compare this vendor to the peers. Explain WHY they are better or worse (cite specific metrics).
      2. Identify who is the BEST vendor in this category based on the data.
      3. Provide a numeric rating (1-10) for the target vendor.

      Reply ONLY with a JSON object.
      Format: { "summary": "Detailed summary explaining why they are good/bad compared to others and naming the best vendor.", "rating": number (1-10) }
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { summary: "Analysis failed", rating: 0 };

    // Update vendor
    vendor.aiAnalysis = {
      lastUpdated: new Date(),
      summary: analysis.summary,
      rating: analysis.rating,
    };
    await vendor.save();

    return NextResponse.json({ vendor });
  } catch (error) {
    console.error("Vendor Evaluation Error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate vendor" },
      { status: 500 },
    );
  }
}
