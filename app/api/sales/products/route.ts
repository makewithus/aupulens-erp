export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import InventoryItem from "@/models/InventoryItem";
import { escapeRegex } from "@/lib/utils/regex";
import { sanitizeProductPayload } from "@/lib/sales/productSanitize";
import { STOCK_LEVEL_STATUS } from "@/lib/constants/statuses";

export async function GET(req: any) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const pageParam = searchParams.get("page");
    const limit = parseInt(searchParams.get("limit") || "10");

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    // Build Filter
    const filter: any = {
      tenantId,
    };

    const status = searchParams.get("status");
    if (status) {
      filter.status = status;
    }

    if (query) {
      const regex = new RegExp(escapeRegex(query), "i");
      filter.$and = [
        {
          $or: [
            { "header.name": regex },
            { "tab_general_information.default_code": regex },
            { "tab_general_information.description": regex },
          ],
        },
      ];
    }

    // Pagination is opt-in via `page` — omitting it returns every matching
    // product. Most callers (product pickers inside Sale Order / Invoice /
    // Bill / Quote / Purchase Order / Subscription forms, and other modules'
    // product dropdowns) rely on getting the complete catalog, not just the
    // first page, so this default must stay unbounded for them.
    const baseQuery = Product.find(filter).sort({ createdAt: -1 });
    let total: number;
    let page = 1;
    let productsResult: any[];
    if (pageParam) {
      page = Math.max(1, parseInt(pageParam));
      const skip = (page - 1) * limit;
      const [products, count] = await Promise.all([
        baseQuery.skip(skip).limit(limit).lean(),
        Product.countDocuments(filter),
      ]);
      total = count;
      productsResult = products;
    } else {
      productsResult = await baseQuery.lean();
      total = productsResult.length;
    }

    // Attach inventory info — one batched query for every product's item
    // code instead of a per-product round trip (InventoryItem already has a
    // {tenantId,itemCode} unique index, so this is fully index-covered).
    const codes = productsResult
      .map((p: any) => p.tab_general_information?.default_code)
      .filter(Boolean);
    const invItems = codes.length
      ? await InventoryItem.find({ tenantId, itemCode: { $in: codes } }).lean()
      : [];
    const invByCode = new Map(invItems.map((i: any) => [i.itemCode, i]));

    const enrichedProducts = productsResult.map((product: any) => {
      const code = product.tab_general_information?.default_code;
      const invItem = code ? invByCode.get(code) : undefined;
      return {
        ...product,
        inventoryQty: invItem?.quantity || 0,
        inventoryStatus: invItem?.status || "out_of_stock",
      };
    });

    return NextResponse.json({
      items: enrichedProducts,
      pagination: {
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
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
    const body = sanitizeProductPayload(await request.json());

    if (!body.header?.name) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 },
      );
    }

    const product = await Product.create({
      ...body,
      tenantId,
      createdBy: session.user.id,
    });

    const productType = body.tab_general_information?.type || "consu";
    
    // Auto-create InventoryItem for non-service products
    if (productType !== "service") {
      try {
        const itemCode = body.tab_general_information?.default_code || product._id.toString();
        await InventoryItem.create({
          tenantId,
          itemCode: itemCode,
          name: body.header.name,
          description: body.tab_general_information?.description || "",
          category: "General",
          unit: "Unit",
          quantity: 0,
          reorderLevel: 10,
          reorderQuantity: 20,
          unitCost: body.tab_general_information?.standard_price || 0,
          totalValue: 0,
          warehouse: "Main Warehouse",
          status: STOCK_LEVEL_STATUS.OUT_OF_STOCK,
          createdBy: session.user.id,
        });
      } catch (err) {
        console.error("Warning: Failed to auto-create inventory mapping", err);
      }
    }

    return NextResponse.json({ product }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating product:", error);
    if (error?.name === "ValidationError") {
      const fieldErrors = Object.fromEntries(
        Object.entries(error.errors || {}).map(([field, err]: [string, any]) => [field, err.message]),
      );
      return NextResponse.json(
        { error: "Invalid product data", fields: fieldErrors },
        { status: 400 },
      );
    }
    if (error?.name === "CastError") {
      return NextResponse.json(
        { error: `Invalid value for "${error.path}". Please check that field and try again.` },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
