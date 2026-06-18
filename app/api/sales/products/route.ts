export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import InventoryItem from "@/models/InventoryItem";

export async function GET(req: any) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    const tenantId = session.user.tenantId || "default-tenant";

    // Build Filter
    const filter: any = {
      tenantId,
    };

    if (query) {
      const regex = new RegExp(query, "i");
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

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    // Attach inventory info
    const enrichedProducts = await Promise.all(
      products.map(async (product: any) => {
        const code = product.tab_general_information?.default_code;
        let inventoryQty = 0;
        let inventoryStatus = "out_of_stock";
        
        if (code) {
          const invItem = await InventoryItem.findOne({ tenantId, itemCode: code }).lean();
          if (invItem) {
            inventoryQty = invItem.quantity || 0;
            inventoryStatus = invItem.status || "out_of_stock";
          }
        }
        
        return {
          ...product,
          inventoryQty,
          inventoryStatus,
        };
      })
    );

    return NextResponse.json({
      items: enrichedProducts,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
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


    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const body = await request.json();

    if (!body.header?.name) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 },
      );
    }

    const product = await Product.create({
      ...body,
      tenantId: session.user.tenantId || "default-tenant",
      createdBy: session.user.id,
    });

    const productType = body.tab_general_information?.type || "consu";
    
    // Auto-create InventoryItem for non-service products
    if (productType !== "service") {
      try {
        const itemCode = body.tab_general_information?.default_code || product._id.toString();
        await InventoryItem.create({
          tenantId: session.user.tenantId || "default-tenant",
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
          status: "out_of_stock",
          createdBy: session.user.id,
        });
      } catch (err) {
        console.error("Warning: Failed to auto-create inventory mapping", err);
      }
    }

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
