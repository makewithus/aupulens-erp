export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Product from "@/models/inventory/Product";
import InventoryItem from "@/models/inventory/InventoryItem";
import Stock from "@/models/inventory/Stock";
import { escapeRegex } from "@/lib/utils/regex";
import { STOCK_LEVEL_STATUS } from "@/lib/constants/statuses";
import { dedupeProductsForTenant } from "@/lib/migration/productDedupe";
import {
  sanitizeProductPayload,
  isAccountingArtifact,
  ACCOUNTING_ARTIFACT_NAME_REGEX,
  ACCOUNTING_ARTIFACT_CODE_REGEX,
} from "@/lib/sales/productSanitize";

function productIdentityFilter(body: any, tenantId: string, excludeId?: string) {
  const code = String(body.tab_general_information?.default_code || "").trim();
  const name = String(body.header?.name || "").trim();
  const clauses = [];
  if (code) clauses.push({ "tab_general_information.default_code": code });
  if (name) clauses.push({ "header.name": name });
  if (!clauses.length) return null;
  return {
    tenantId,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: clauses,
  };
}

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
    await dedupeProductsForTenant(tenantId);

    // Build Filter
    const filter: any = {
      tenantId,
    };

    // Exclude confirmed non-product accounting artifacts (receipt/payment legacy entries)
    // unless explicitly requested via includeArtifacts=true
    if (searchParams.get("includeArtifacts") !== "true") {
      filter["header.name"] = {
        $not: ACCOUNTING_ARTIFACT_NAME_REGEX,
      };
      filter["tab_general_information.default_code"] = {
        $not: ACCOUNTING_ARTIFACT_CODE_REGEX,
      };
    }

    const status = searchParams.get("status");
    if (status) {
      filter.status = status;
    }

    const hsnSacCode = searchParams.get("hsnSacCode") || searchParams.get("hsn");
    if (hsnSacCode) {
      filter["tab_general_information.hsnSacCode"] = new RegExp(escapeRegex(hsnSacCode.trim()), "i");
    }

    const gstRate = searchParams.get("gstRate");
    if (gstRate !== null && gstRate !== "" && !Number.isNaN(Number(gstRate))) {
      filter["tab_general_information.gstRate"] = Number(gstRate);
    }

    const gstTreatment = searchParams.get("gstTreatment");
    if (gstTreatment) {
      filter["tab_general_information.gstTreatment"] = gstTreatment;
    }

    if (searchParams.get("missingHsn") === "true") {
      filter.$or = [
        { "tab_general_information.hsnSacCode": { $exists: false } },
        { "tab_general_information.hsnSacCode": "" },
        { "tab_general_information.hsnSacCode": null },
      ];
    }

    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) filter.createdAt = range;
    }

    if (query) {
      const words = query.trim().split(/\\s+/).map(w => escapeRegex(w));
      filter.$and = words.map(word => ({
        $or: [
          { "header.name": { $regex: word, $options: "i" } },
          { "tab_general_information.default_code": { $regex: word, $options: "i" } },
          { "tab_general_information.description": { $regex: word, $options: "i" } },
        ],
      }));
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

    // Product movements are the live stock ledger. InventoryItem is retained
    // as an opening balance for older workspaces, but its cached quantity goes
    // stale as soon as a PO receipt or sales shipment writes ledger movements.
    const productIds = productsResult.map((p: any) => p._id);
    const [stockBalances, productsWithMovements] = productIds.length ? await Promise.all([
      Stock.aggregate([
        { $match: { tenantId, product: { $in: productIds } } },
        { $group: { _id: "$product", quantity: { $sum: "$quantity" } } },
      ]),
      Stock.distinct("product", { tenantId, product: { $in: productIds } }),
    ]) : [[], []];
    const stockByProduct = new Map(stockBalances.map((row: any) => [String(row._id), Number(row.quantity) || 0]));
    const movementProductIds = new Set(productsWithMovements.map(String));

    const enrichedProducts = productsResult.map((product: any) => {
      const code = product.tab_general_information?.default_code;
      const invItem = code ? invByCode.get(code) : undefined;
      const hasLedger = movementProductIds.has(String(product._id));
      const inventoryQty = hasLedger ? stockByProduct.get(String(product._id)) || 0 : invItem?.quantity || 0;
      const isService = product.tab_general_information?.type === "service";
      return {
        ...product,
        inventoryQty,
        inventoryStatus: isService ? "not-tracked" : inventoryQty <= 0 ? STOCK_LEVEL_STATUS.OUT_OF_STOCK :
          inventoryQty <= (invItem?.reorderLevel ?? 10) ? STOCK_LEVEL_STATUS.LOW_STOCK : STOCK_LEVEL_STATUS.IN_STOCK,
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

    if (isAccountingArtifact(body)) {
      return NextResponse.json(
        { error: "Cannot create product: name or code matches an accounting transaction artifact." },
        { status: 400 },
      );
    }

    const existingFilter = productIdentityFilter(body, tenantId);
    const existingProduct = existingFilter
      ? await Product.findOne(existingFilter).select("_id").lean()
      : null;

    const product = existingProduct
      ? await Product.findOneAndUpdate(
          { _id: existingProduct._id, tenantId },
          { $set: { ...body, status: body.status || "published" } },
          { new: true, runValidators: true },
        )
      : await Product.create({
          ...body,
          tenantId,
          createdBy: session.user.id,
          status: body.status || "published",
        });

    await dedupeProductsForTenant(tenantId);

    const productType = body.tab_general_information?.type || "consu";
    
    // Auto-create InventoryItem for non-service products
    if (!existingProduct && productType !== "service") {
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
