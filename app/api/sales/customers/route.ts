export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import SalesView from "@/models/sales/SalesView";
import { SYSTEM_VIEW_DEFINITIONS, buildMongoFilterFromCriteria } from "@/lib/sales/customerViews";
import { resolveSpecialFilter } from "@/lib/sales/customerViews.server";

async function ensureSystemViews(tenantId: string) {
  const existing = await SalesView.countDocuments({ tenantId, entityType: "customers", isSystem: true });
  if (existing > 0) return;
  await SalesView.insertMany(
    SYSTEM_VIEW_DEFINITIONS.map((v) => ({
      tenantId,
      entityType: "customers",
      name: v.name,
      criteria: v.criteria || [],
      specialFilter: v.specialFilter,
      columns: [],
      isSystem: true,
    })),
  );
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(request.url);

    // Backward-compatible default: no query params → exactly the old behavior
    // (every ~15 existing consumers across Finance/Inventory/Sales rely on this).
    const search = searchParams.get("search")?.trim();
    const viewId = searchParams.get("viewId");
    const sortField = searchParams.get("sortField");
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;
    const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : null;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : null;

    let query: Record<string, any> = { tenantId };

    if (viewId && viewId !== "all") {
      await ensureSystemViews(tenantId);
      const view = await SalesView.findOne({ _id: viewId, tenantId }).lean();
      if (view) {
        if ((view as any).specialFilter) {
          const special = await resolveSpecialFilter((view as any).specialFilter, tenantId, Customer);
          query = { ...query, ...special };
        } else {
          query = { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
        }
      }
    }

    if (search) {
      query.$or = [
        { "header.name": { $regex: search, $options: "i" } },
        { "header.displayName": { $regex: search, $options: "i" } },
        { "header.companyName": { $regex: search, $options: "i" } },
        { "contact_details.email": { $regex: search, $options: "i" } },
      ];
    }

    // AI-native "redirect with filters" support (lib/ai/memoryFlow.ts) — a
    // date range on createdAt. Additive: omitting these params leaves every
    // existing caller's behavior unchanged.
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) query.createdAt = range;
    }

    let cursor = Customer.find(query).sort(
      sortField ? { [sortField]: sortDir } : { createdAt: -1 },
    );

    if (page && limit) {
      cursor = cursor.skip((page - 1) * limit).limit(limit);
    }

    const [customers, total] = await Promise.all([cursor.lean(), Customer.countDocuments(query)]);

    return NextResponse.json({
      items: customers,
      total,
      page: page || 1,
      totalPages: limit ? Math.ceil(total / limit) : 1,
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
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


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();
    const body = await request.json();

    if (!body.header?.name && !body.header?.displayName) {
      return NextResponse.json(
        { error: "Display Name is required" },
        { status: 400 },
      );
    }

    // Sanitize body to remove empty strings or "default" for ObjectId fields
    if (
      body.sales_purchase_tab?.user_id === "default" ||
      body.sales_purchase_tab?.user_id === ""
    ) {
      if (body.sales_purchase_tab) {
        body.sales_purchase_tab.user_id = undefined;
      }
    }

    if (body.accounting_tab?.property_account_receivable_id === "") {
      if (body.accounting_tab) {
        body.accounting_tab.property_account_receivable_id = undefined;
      }
    }

    if (body.accounting_tab?.property_account_payable_id === "") {
      if (body.accounting_tab) {
        body.accounting_tab.property_account_payable_id = undefined;
      }
    }

    if (!body.header.name) body.header.name = body.header.displayName;

    const customer = await Customer.create({
      ...body,
      tenantId,
      createdBy: session.user.id,
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    console.error("Error creating customer:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
