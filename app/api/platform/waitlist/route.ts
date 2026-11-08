import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Waitlist from "@/models/platform/Waitlist";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { WAITLIST_STATUS_VALUES, WaitlistStatus } from "@/lib/constants/statuses";

export async function GET(request: NextRequest) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json(
      { success: false, message: "Not authenticated as Global Admin." },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10))
    );
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim();
    const formType = searchParams.get("formType")?.trim();

    const query: Record<string, any> = {};

    if (status && status !== "all" && WAITLIST_STATUS_VALUES.includes(status as any)) {
      query.status = status;
    }

    if (formType && formType !== "all" && ["book_demo", "contact"].includes(formType)) {
      query.formType = formType;
    }

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { companyName: searchRegex },
        { fullName: searchRegex },
        { email: searchRegex },
        { waitlistId: searchRegex },
      ];
    }

    const skip = (page - 1) * pageSize;

    const [items, total, countsAgg] = await Promise.all([
      Waitlist.find(query)
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Waitlist.countDocuments(query),
      Waitlist.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const counts: Record<string, number> = {
      New: 0,
      Contacted: 0,
      Approved: 0,
      Onboarded: 0,
      Rejected: 0,
      total: 0,
    };

    let totalAll = 0;
    for (const group of countsAgg) {
      if (group._id && counts[group._id] !== undefined) {
        counts[group._id] = group.count;
      }
      totalAll += group.count;
    }
    counts.total = totalAll;

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
        counts,
      },
    });
  } catch (error: any) {
    console.error("[platform:waitlist] Fetch error:", error?.message || error);
    return NextResponse.json(
      { success: false, message: "Failed to load waitlist records." },
      { status: 500 }
    );
  }
}

