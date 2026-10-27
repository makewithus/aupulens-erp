import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Warehouse from "../models/inventory/Warehouse";
import InventoryItem from "../models/inventory/InventoryItem";
import Batch from "../models/inventory/Batch";
import InventoryOrder from "../models/inventory/InventoryOrder";
import StockMove from "../models/inventory/StockMove";
import Stock from "../models/inventory/Stock";
import Product from "../models/inventory/Product";
import User from "../models/auth/User";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment");
  process.exit(1);
}

const TENANT_ID = "default-tenant";

async function main() {
  console.log("=======================================================");
  console.log("Connecting to MongoDB for Inventory Analytics Seeding...");
  await mongoose.connect(MONGODB_URI!);
  console.log("Connected successfully to DB:", mongoose.connection.name);
  console.log("Target Tenant:", TENANT_ID);
  console.log("=======================================================");

  // Find admin user for createdBy
  const adminUser = await User.findOne({
    tenantId: TENANT_ID,
    email: "admin@aupulens.com",
  }).lean();

  const adminId = adminUser?._id || new mongoose.Types.ObjectId("6a215dc202e80e4219f412c0");
  console.log("Admin User ID:", adminId);

  // ─────────────────────────────────────────────────────────────
  // 1. SEED WAREHOUSES
  // ─────────────────────────────────────────────────────────────
  console.log("\n==> 1. Seeding Warehouses...");
  const warehouseDefs = [
    {
      warehouseCode: "WH-BOM-01",
      name: "Mumbai Central Logistics Hub",
      location: "Bhiwandi Logistics Corridor, Maharashtra",
      address: "Plot 42, Sector 8, Bhiwandi Industrial Zone, Thane 421302",
      capacity: 50000,
      currentUtilization: 38200,
      type: "standard" as const,
      manager: "Rajesh Sharma",
      contact: "+91 98201 12345",
      email: "wh-mumbai@aupulens.com",
      status: "active" as const,
    },
    {
      warehouseCode: "WH-BLR-02",
      name: "Bengaluru South Facility",
      location: "Electronic City Phase 2, Bengaluru",
      address: "18/B Bommasandra Industrial Area, Bengaluru 560099",
      capacity: 35000,
      currentUtilization: 24800,
      type: "standard" as const,
      manager: "Kavita Nair",
      contact: "+91 98450 67890",
      email: "wh-blr@aupulens.com",
      status: "active" as const,
    },
    {
      warehouseCode: "WH-DEL-03",
      name: "Delhi North Fulfillment Ctr",
      location: "Kundli Logistics Park, Delhi NCR",
      address: "Zone C, Grand Trunk Road, Kundli, Haryana 131028",
      capacity: 45000,
      currentUtilization: 31500,
      type: "bonded" as const,
      manager: "Amitabh Verma",
      contact: "+91 98110 33445",
      email: "wh-delhi@aupulens.com",
      bondedLicense: "CUS-DEL-BOND-2026-88",
      bondedExpiryDate: new Date("2028-12-31"),
      status: "active" as const,
    },
    {
      warehouseCode: "WH-HYD-04",
      name: "Hyderabad Tech Depot",
      location: "Shamshabad Cargo Hub, Telangana",
      address: "Hardware Park Phase 1, Shamshabad, Hyderabad 501218",
      capacity: 30000,
      currentUtilization: 19400,
      type: "standard" as const,
      manager: "Srinivas Rao",
      contact: "+91 98660 55667",
      email: "wh-hyd@aupulens.com",
      status: "active" as const,
    },
    {
      warehouseCode: "WH-PUN-05",
      name: "Pune Regional Depot",
      location: "Chakan Industrial Zone, Pune",
      address: "MIDC Phase 3, Chakan Industrial Area, Pune 410501",
      capacity: 25000,
      currentUtilization: 17600,
      type: "cold-storage" as const,
      manager: "Pooja Deshmukh",
      contact: "+91 98220 77889",
      email: "wh-pune@aupulens.com",
      status: "active" as const,
    },
  ];

  const warehouseMap = new Map<string, any>();
  for (const wh of warehouseDefs) {
    const doc = await Warehouse.findOneAndUpdate(
      { tenantId: TENANT_ID, warehouseCode: wh.warehouseCode },
      {
        $set: {
          ...wh,
          tenantId: TENANT_ID,
          createdBy: adminId,
        },
      },
      { upsert: true, new: true }
    );
    warehouseMap.set(wh.name, doc);
  }
  console.log(`Seeded ${warehouseMap.size} Warehouses successfully.`);

  // ─────────────────────────────────────────────────────────────
  // 2. SEED INVENTORY ITEMS
  // ─────────────────────────────────────────────────────────────
  console.log("\n==> 2. Seeding Inventory Items across Categories and Warehouses...");
  const itemDefs = [
    // Eyewear Frames
    {
      itemCode: "ITM-FRM-001",
      name: "Titanium Aviator Frame 54mm (Gunmetal)",
      category: "Eyewear Frames",
      unit: "pcs",
      quantity: 1450,
      reorderLevel: 300,
      reorderQuantity: 800,
      unitCost: 1250,
      totalValue: 1812500,
      warehouse: "Mumbai Central Logistics Hub",
      location: "Aisle A1-Rack 03",
      supplier: "Nippon Titanium Precision Ltd",
    },
    {
      itemCode: "ITM-FRM-002",
      name: "Acetate Cat-Eye Classic Frame (Tortoise)",
      category: "Eyewear Frames",
      unit: "pcs",
      quantity: 980,
      reorderLevel: 250,
      reorderQuantity: 600,
      unitCost: 850,
      totalValue: 833000,
      warehouse: "Bengaluru South Facility",
      location: "Aisle B2-Rack 01",
      supplier: "Mazzucchelli 1849 Spa",
    },
    {
      itemCode: "ITM-FRM-003",
      name: "TR-90 Ultralight Square Frame (Matte Black)",
      category: "Eyewear Frames",
      unit: "pcs",
      quantity: 2100,
      reorderLevel: 500,
      reorderQuantity: 1000,
      unitCost: 480,
      totalValue: 1008000,
      warehouse: "Delhi North Fulfillment Ctr",
      location: "Aisle C1-Rack 04",
      supplier: "EMS-Grivory Switzerland",
    },
    {
      itemCode: "ITM-FRM-004",
      name: "Stainless Steel Rimless Minimalist Frame",
      category: "Eyewear Frames",
      unit: "pcs",
      quantity: 820,
      reorderLevel: 200,
      reorderQuantity: 500,
      unitCost: 950,
      totalValue: 779000,
      warehouse: "Hyderabad Tech Depot",
      location: "Aisle D3-Rack 02",
      supplier: "Sandvik Precision Wire",
    },

    // Optical Lenses
    {
      itemCode: "ITM-LNS-001",
      name: "1.67 High-Index Aspheric Lens Blank",
      category: "Optical Lenses",
      unit: "pairs",
      quantity: 2800,
      reorderLevel: 600,
      reorderQuantity: 1500,
      unitCost: 550,
      totalValue: 1540000,
      warehouse: "Delhi North Fulfillment Ctr",
      location: "Cleanroom Alpha-01",
      supplier: "Mitsui Chemicals Inc",
    },
    {
      itemCode: "ITM-LNS-002",
      name: "Polarized CR-39 Grey 80% Tint Lens",
      category: "Optical Lenses",
      unit: "pairs",
      quantity: 1650,
      reorderLevel: 400,
      reorderQuantity: 1000,
      unitCost: 680,
      totalValue: 1122000,
      warehouse: "Mumbai Central Logistics Hub",
      location: "Aisle A4-Rack 02",
      supplier: "PPG Industries Monomers",
    },
    {
      itemCode: "ITM-LNS-003",
      name: "Blue-Cut Anti-Reflective 1.60 Lens",
      category: "Optical Lenses",
      unit: "pairs",
      quantity: 3400,
      reorderLevel: 800,
      reorderQuantity: 2000,
      unitCost: 420,
      totalValue: 1428000,
      warehouse: "Hyderabad Tech Depot",
      location: "Aisle D1-Rack 05",
      supplier: "Tokai Optical Japan",
    },
    {
      itemCode: "ITM-LNS-004",
      name: "Photochromic Transitions Gen 8 Grey Lens",
      category: "Optical Lenses",
      unit: "pairs",
      quantity: 1250,
      reorderLevel: 300,
      reorderQuantity: 700,
      unitCost: 1150,
      totalValue: 1437500,
      warehouse: "Bengaluru South Facility",
      location: "Cleanroom Beta-02",
      supplier: "Transitions Optical Inc",
    },

    // Sunglasses
    {
      itemCode: "ITM-SNG-001",
      name: "Polarized Wayfarer UV400 (Matte Onyx)",
      category: "Sunglasses",
      unit: "pcs",
      quantity: 1350,
      reorderLevel: 350,
      reorderQuantity: 800,
      unitCost: 1100,
      totalValue: 1485000,
      warehouse: "Pune Regional Depot",
      location: "Aisle P1-Rack 01",
      supplier: "Aupulens Design Studio",
    },
    {
      itemCode: "ITM-SNG-002",
      name: "Round Retro Gold Mirror Sunglasses",
      category: "Sunglasses",
      unit: "pcs",
      quantity: 780,
      reorderLevel: 200,
      reorderQuantity: 500,
      unitCost: 1380,
      totalValue: 1076400,
      warehouse: "Bengaluru South Facility",
      location: "Aisle B1-Rack 06",
      supplier: "Aupulens Luxe Line",
    },
    {
      itemCode: "ITM-SNG-003",
      name: "Sports Wrap-Around Hydrophobic Cycling Specs",
      category: "Sunglasses",
      unit: "pcs",
      quantity: 920,
      reorderLevel: 250,
      reorderQuantity: 600,
      unitCost: 1250,
      totalValue: 1150000,
      warehouse: "Mumbai Central Logistics Hub",
      location: "Aisle A2-Rack 04",
      supplier: "Aupulens Active Performance",
    },

    // Contact Lenses
    {
      itemCode: "ITM-CTL-001",
      name: "Monthly Hydrogel Contact Lenses (6-Pack)",
      category: "Contact Lenses",
      unit: "boxes",
      quantity: 4500,
      reorderLevel: 1000,
      reorderQuantity: 3000,
      unitCost: 280,
      totalValue: 1260000,
      warehouse: "Delhi North Fulfillment Ctr",
      location: "Cold Bay North-01",
      supplier: "CooperVision Medical",
    },
    {
      itemCode: "ITM-CTL-002",
      name: "Daily Silicone Comfort Lenses (30-Pack)",
      category: "Contact Lenses",
      unit: "boxes",
      quantity: 5200,
      reorderLevel: 1200,
      reorderQuantity: 3500,
      unitCost: 340,
      totalValue: 1768000,
      warehouse: "Mumbai Central Logistics Hub",
      location: "Cold Bay Central-02",
      supplier: "Alcon Vision Care",
    },

    // Packaging & Cases
    {
      itemCode: "ITM-PKG-001",
      name: "Magnetic Hard Shell Vegan Leather Case",
      category: "Packaging & Cases",
      unit: "pcs",
      quantity: 7200,
      reorderLevel: 1500,
      reorderQuantity: 4000,
      unitCost: 95,
      totalValue: 684000,
      warehouse: "Hyderabad Tech Depot",
      location: "Bulk Bay H-01",
      supplier: "Guangdong Craft Packaging",
    },
    {
      itemCode: "ITM-PKG-002",
      name: "Collapsible Origami Eyewear Case (Carbon Grey)",
      category: "Packaging & Cases",
      unit: "pcs",
      quantity: 4800,
      reorderLevel: 1000,
      reorderQuantity: 2500,
      unitCost: 75,
      totalValue: 360000,
      warehouse: "Pune Regional Depot",
      location: "Bulk Bay P-03",
      supplier: "EcoPack Sustainable Solutions",
    },

    // Cleaning & Care
    {
      itemCode: "ITM-CLN-001",
      name: "Anti-Fog Multi-Coating Spray 60ml",
      category: "Cleaning & Care",
      unit: "bottles",
      quantity: 8500,
      reorderLevel: 2000,
      reorderQuantity: 5000,
      unitCost: 45,
      totalValue: 382500,
      warehouse: "Pune Regional Depot",
      location: "Liquid Storage Bay 02",
      supplier: "OptiClean Formulation Labs",
    },
    {
      itemCode: "ITM-CLN-002",
      name: "Microfiber Ultra-Dense Polishing Cloth (18x18cm)",
      category: "Cleaning & Care",
      unit: "pcs",
      quantity: 14000,
      reorderLevel: 3000,
      reorderQuantity: 8000,
      unitCost: 22,
      totalValue: 308000,
      warehouse: "Bengaluru South Facility",
      location: "Bin C-09",
      supplier: "Toray Microfiber Japan",
    },

    // Optical Accessories
    {
      itemCode: "ITM-ACC-001",
      name: "Medical Silicone Nose Pads (50 Pairs Pack)",
      category: "Optical Accessories",
      unit: "packs",
      quantity: 3600,
      reorderLevel: 800,
      reorderQuantity: 2000,
      unitCost: 65,
      totalValue: 234000,
      warehouse: "Delhi North Fulfillment Ctr",
      location: "Small Parts Cabinet S-04",
      supplier: "Frey & Winkler Precision",
    },
    {
      itemCode: "ITM-ACC-002",
      name: "Micro Precision Screwdriver & Screw Set",
      category: "Optical Accessories",
      unit: "kits",
      quantity: 1500,
      reorderLevel: 300,
      reorderQuantity: 800,
      unitCost: 185,
      totalValue: 277500,
      warehouse: "Hyderabad Tech Depot",
      location: "Tooling Shelf T-01",
      supplier: "Wera Optical Tools",
    },
    {
      itemCode: "ITM-ACC-003",
      name: "Braided Leather Eyewear Retainer Cord",
      category: "Optical Accessories",
      unit: "pcs",
      quantity: 2400,
      reorderLevel: 500,
      reorderQuantity: 1200,
      unitCost: 120,
      totalValue: 288000,
      warehouse: "Mumbai Central Logistics Hub",
      location: "Aisle A5-Rack 01",
      supplier: "Heritage Accessories Co",
    },
  ];

  for (const item of itemDefs) {
    await InventoryItem.findOneAndUpdate(
      { tenantId: TENANT_ID, itemCode: item.itemCode },
      {
        $set: {
          ...item,
          status: "in-stock",
          tenantId: TENANT_ID,
          createdBy: adminId,
          lastRestocked: new Date(Date.now() - Math.floor(Math.random() * 15) * 86400000),
        },
      },
      { upsert: true, new: true }
    );
  }
  console.log(`Seeded ${itemDefs.length} InventoryItems successfully.`);

  // Also ensure stock ledger entries exist in 'stocks' collection for on-hand tracking
  console.log("\n==> 2b. Syncing Product Stock Ledger entries...");
  const existingProducts = await Product.find({ tenantId: TENANT_ID }).lean();
  for (let i = 0; i < existingProducts.length; i++) {
    const prod = existingProducts[i];
    const qty = 450 + (i * 120);
    await Stock.findOneAndUpdate(
      { tenantId: TENANT_ID, product: prod._id, reference: "Initial Stock Seeding" },
      {
        $set: {
          tenantId: TENANT_ID,
          product: prod._id,
          quantity: qty,
          type: "in",
          reference: "Initial Stock Seeding",
          warehouse: warehouseDefs[i % warehouseDefs.length].name,
          createdBy: adminId,
        },
      },
      { upsert: true }
    );
  }
  console.log(`Synced ${existingProducts.length} product stock ledger rows.`);

  // ─────────────────────────────────────────────────────────────
  // 3. SEED BATCHES
  // ─────────────────────────────────────────────────────────────
  console.log("\n==> 3. Seeding Batches across Warehouses...");
  const batchDefs = [
    {
      batchNumber: "BAT-2026-001",
      lotNumber: "LOT-26A-01",
      itemCode: "ITM-FRM-001",
      itemName: "Titanium Aviator Frame 54mm (Gunmetal)",
      quantity: 650,
      warehouse: "Mumbai Central Logistics Hub",
      location: "Aisle A1-Rack 03",
      status: "active" as const,
      manufactureDate: new Date("2026-01-15"),
      expiryDate: new Date("2028-06-30"),
      supplier: "Nippon Titanium Precision Ltd",
    },
    {
      batchNumber: "BAT-2026-002",
      lotNumber: "LOT-26A-02",
      itemCode: "ITM-FRM-002",
      itemName: "Acetate Cat-Eye Classic Frame (Tortoise)",
      quantity: 480,
      warehouse: "Bengaluru South Facility",
      location: "Aisle B2-Rack 01",
      status: "active" as const,
      manufactureDate: new Date("2026-02-10"),
      expiryDate: new Date("2028-08-31"),
      supplier: "Mazzucchelli 1849 Spa",
    },
    {
      batchNumber: "BAT-2026-003",
      lotNumber: "LOT-26B-01",
      itemCode: "ITM-LNS-001",
      itemName: "1.67 High-Index Aspheric Lens Blank",
      quantity: 1400,
      warehouse: "Delhi North Fulfillment Ctr",
      location: "Cleanroom Alpha-01",
      status: "released" as const,
      manufactureDate: new Date("2026-01-20"),
      expiryDate: new Date("2027-12-31"),
      supplier: "Mitsui Chemicals Inc",
    },
    {
      batchNumber: "BAT-2026-004",
      lotNumber: "LOT-26B-02",
      itemCode: "ITM-LNS-003",
      itemName: "Blue-Cut Anti-Reflective 1.60 Lens",
      quantity: 1800,
      warehouse: "Hyderabad Tech Depot",
      location: "Aisle D1-Rack 05",
      status: "active" as const,
      manufactureDate: new Date("2026-03-01"),
      expiryDate: new Date("2027-11-30"),
      supplier: "Tokai Optical Japan",
    },
    {
      batchNumber: "BAT-2026-005",
      lotNumber: "LOT-26C-01",
      itemCode: "ITM-SNG-001",
      itemName: "Polarized Wayfarer UV400 (Matte Onyx)",
      quantity: 750,
      warehouse: "Pune Regional Depot",
      location: "Aisle P1-Rack 01",
      status: "active" as const,
      manufactureDate: new Date("2026-02-15"),
      expiryDate: new Date("2029-01-31"),
      supplier: "Aupulens Design Studio",
    },
    {
      batchNumber: "BAT-2026-006",
      lotNumber: "LOT-26C-02",
      itemCode: "ITM-SNG-002",
      itemName: "Round Retro Gold Mirror Sunglasses",
      quantity: 340,
      warehouse: "Bengaluru South Facility",
      location: "Aisle B1-Rack 06",
      status: "quarantine" as const,
      manufactureDate: new Date("2026-03-12"),
      expiryDate: new Date("2028-12-31"),
      supplier: "Aupulens Luxe Line",
      notes: "Optical coating uniformity verification in progress",
    },
    {
      batchNumber: "BAT-2026-007",
      lotNumber: "LOT-26D-01",
      itemCode: "ITM-CTL-001",
      itemName: "Monthly Hydrogel Contact Lenses (6-Pack)",
      quantity: 2200,
      warehouse: "Delhi North Fulfillment Ctr",
      location: "Cold Bay North-01",
      status: "released" as const,
      manufactureDate: new Date("2026-01-05"),
      expiryDate: new Date("2027-06-30"),
      supplier: "CooperVision Medical",
    },
    {
      batchNumber: "BAT-2026-008",
      lotNumber: "LOT-26D-02",
      itemCode: "ITM-CTL-002",
      itemName: "Daily Silicone Comfort Lenses (30-Pack)",
      quantity: 2600,
      warehouse: "Mumbai Central Logistics Hub",
      location: "Cold Bay Central-02",
      status: "active" as const,
      manufactureDate: new Date("2026-02-28"),
      expiryDate: new Date("2027-09-30"),
      supplier: "Alcon Vision Care",
    },
    {
      batchNumber: "BAT-2026-009",
      lotNumber: "LOT-26E-01",
      itemCode: "ITM-CLN-001",
      itemName: "Anti-Fog Multi-Coating Spray 60ml",
      quantity: 4200,
      warehouse: "Pune Regional Depot",
      location: "Liquid Storage Bay 02",
      status: "active" as const,
      manufactureDate: new Date("2026-02-01"),
      expiryDate: new Date("2027-02-01"),
      supplier: "OptiClean Formulation Labs",
    },
    {
      batchNumber: "BAT-2026-010",
      lotNumber: "LOT-26E-02",
      itemCode: "ITM-PKG-001",
      itemName: "Magnetic Hard Shell Vegan Leather Case",
      quantity: 3800,
      warehouse: "Hyderabad Tech Depot",
      location: "Bulk Bay H-01",
      status: "released" as const,
      manufactureDate: new Date("2026-01-18"),
      supplier: "Guangdong Craft Packaging",
    },
    {
      batchNumber: "BAT-2026-011",
      lotNumber: "LOT-26F-01",
      itemCode: "ITM-FRM-003",
      itemName: "TR-90 Ultralight Square Frame (Matte Black)",
      quantity: 1100,
      warehouse: "Delhi North Fulfillment Ctr",
      location: "Aisle C1-Rack 04",
      status: "active" as const,
      manufactureDate: new Date("2026-03-05"),
      expiryDate: new Date("2029-03-05"),
      supplier: "EMS-Grivory Switzerland",
    },
    {
      batchNumber: "BAT-2026-012",
      lotNumber: "LOT-26F-02",
      itemCode: "ITM-LNS-002",
      itemName: "Polarized CR-39 Grey 80% Tint Lens",
      quantity: 850,
      warehouse: "Mumbai Central Logistics Hub",
      location: "Aisle A4-Rack 02",
      status: "quarantine" as const,
      manufactureDate: new Date("2026-03-14"),
      expiryDate: new Date("2028-03-14"),
      supplier: "PPG Industries Monomers",
      notes: "Awaiting QA clearance for optical axis alignment",
    },
    {
      batchNumber: "BAT-2026-013",
      lotNumber: "LOT-26G-01",
      itemCode: "ITM-ACC-001",
      itemName: "Medical Silicone Nose Pads (50 Pairs Pack)",
      quantity: 1900,
      warehouse: "Delhi North Fulfillment Ctr",
      location: "Small Parts Cabinet S-04",
      status: "released" as const,
      manufactureDate: new Date("2026-01-10"),
      expiryDate: new Date("2030-01-10"),
      supplier: "Frey & Winkler Precision",
    },
    {
      batchNumber: "BAT-2026-014",
      lotNumber: "LOT-26G-02",
      itemCode: "ITM-CLN-002",
      itemName: "Microfiber Ultra-Dense Polishing Cloth (18x18cm)",
      quantity: 7500,
      warehouse: "Bengaluru South Facility",
      location: "Bin C-09",
      status: "active" as const,
      manufactureDate: new Date("2026-02-12"),
      supplier: "Toray Microfiber Japan",
    },
    {
      batchNumber: "BAT-2026-015",
      lotNumber: "LOT-26H-01",
      itemCode: "ITM-FRM-004",
      itemName: "Stainless Steel Rimless Minimalist Frame",
      quantity: 410,
      warehouse: "Hyderabad Tech Depot",
      location: "Aisle D3-Rack 02",
      status: "active" as const,
      manufactureDate: new Date("2026-02-20"),
      expiryDate: new Date("2028-02-20"),
      supplier: "Sandvik Precision Wire",
    },
  ];

  for (const batch of batchDefs) {
    await Batch.findOneAndUpdate(
      { tenantId: TENANT_ID, batchNumber: batch.batchNumber },
      {
        $set: {
          ...batch,
          tenantId: TENANT_ID,
          createdBy: adminId,
        },
      },
      { upsert: true }
    );
  }
  console.log(`Seeded ${batchDefs.length} Batches successfully.`);

  // ─────────────────────────────────────────────────────────────
  // 4. SEED INVENTORY ORDERS (Spanning 90-day timeline)
  // ─────────────────────────────────────────────────────────────
  console.log("\n==> 4. Seeding Inventory Orders (Spanning 90 days for trend charts)...");
  const customers = [
    "Titan Eyeplus Corporation",
    "Lenskart Solutions Ltd",
    "Lawrence & Mayo Opticians",
    "Vision Express India",
    "Himalaya Optical Co",
    "GKB Opticals Ltd",
    "Spectacle Hub Mumbai",
    "ClearView Clinics Bengaluru",
    "Metro Vision Center Delhi",
    "Apollo Optical Care",
    "EyeMax Retails Pvt Ltd",
    "OptiCare Diagnostics Pune",
  ];

  const warehousesList = warehouseDefs.map((w) => w.name);
  const orderStatuses = ["delivered", "delivered", "shipped", "shipped", "fulfilled", "processing", "pending"];

  const ordersToSeed = [];
  const nowMs = Date.now();
  const dayMs = 86400000;

  for (let i = 0; i < 90; i++) {
    // 1 to 2 orders per day across 90 days
    const ordersPerDay = (i % 7 === 0 || i % 13 === 0) ? 2 : 1;

    for (let k = 0; k < ordersPerDay; k++) {
      const orderIdx = i * 2 + k + 1;
      const orderNumber = `ORD-2026-${String(orderIdx + 1000).padStart(5, "0")}`;
      const daysAgo = 89 - i;
      const orderDate = new Date(nowMs - daysAgo * dayMs);
      const deliveryDate = new Date(orderDate.getTime() + 4 * dayMs);

      const wh = warehousesList[(i + k) % warehousesList.length];
      const cust = customers[(i * 3 + k) % customers.length];
      const status = daysAgo > 30 ? "delivered" : (daysAgo > 10 ? (orderStatuses[(i + k) % 4]) : (orderStatuses[(i + k) % orderStatuses.length]));

      const itm1 = itemDefs[(i + k) % itemDefs.length];
      const itm2 = itemDefs[(i + k + 4) % itemDefs.length];
      const q1 = 5 + ((i * 3) % 25);
      const q2 = 10 + ((i * 7) % 35);

      const items = [
        {
          itemCode: itm1.itemCode,
          itemName: itm1.name,
          quantity: q1,
          fulfilledQuantity: status === "delivered" || status === "fulfilled" ? q1 : Math.floor(q1 * 0.7),
          unitPrice: Math.round(itm1.unitCost * 1.4),
          totalPrice: q1 * Math.round(itm1.unitCost * 1.4),
        },
        {
          itemCode: itm2.itemCode,
          itemName: itm2.name,
          quantity: q2,
          fulfilledQuantity: status === "delivered" || status === "fulfilled" ? q2 : Math.floor(q2 * 0.7),
          unitPrice: Math.round(itm2.unitCost * 1.4),
          totalPrice: q2 * Math.round(itm2.unitCost * 1.4),
        },
      ];

      const totalQuantity = q1 + q2;
      const totalAmount = items[0].totalPrice + items[1].totalPrice;

      ordersToSeed.push({
        orderNumber,
        customerName: cust,
        customerEmail: `${cust.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
        orderDate,
        expectedDeliveryDate: deliveryDate,
        warehouse: wh,
        status,
        items,
        totalQuantity,
        totalAmount,
        shippingAddress: `Commercial Park, Hub ${orderIdx}, India`,
        trackingNumber: `AUP-TRK-${orderIdx}892`,
        tenantId: TENANT_ID,
        createdBy: adminId,
      });
    }
  }

  for (const ord of ordersToSeed) {
    await InventoryOrder.findOneAndUpdate(
      { tenantId: TENANT_ID, orderNumber: ord.orderNumber },
      { $set: ord },
      { upsert: true }
    );
  }
  console.log(`Seeded ${ordersToSeed.length} Inventory Orders successfully.`);

  // ─────────────────────────────────────────────────────────────
  // 5. SEED STOCK MOVES (Spanning full 365-day timeline for Brick Chart)
  // ─────────────────────────────────────────────────────────────
  console.log("\n==> 5. Seeding Stock Moves (Spanning full 365 days for Daily Brick Bar Chart)...");
  const moveTypes = ["incoming", "outgoing", "internal", "adjustment"] as const;
  const moveStatuses = ["done", "done", "done", "confirmed", "waiting"] as const;

  const movesToSeed = [];
  const totalDays = 365;

  for (let d = 0; d < totalDays; d++) {
    // Distribute movements across days with realistic oscillations
    const daysAgo = 364 - d;
    const moveDate = new Date(nowMs - daysAgo * dayMs);

    // Some days have 1-3 movements, some have bursts (creating nice multi-level brick stacks)
    const dayOfWeek = moveDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const movesOnDay = isWeekend ? (d % 3 === 0 ? 1 : 0) : ((d % 11 === 0) ? 3 : (d % 5 === 0 ? 2 : 1));

    for (let m = 0; m < movesOnDay; m++) {
      const moveIdx = d * 4 + m + 1;
      const reference = `SM-2026-${String(moveIdx).padStart(5, "0")}`;
      const moveType = moveTypes[(d + m) % moveTypes.length];
      const moveStatus = daysAgo > 5 ? "done" : moveStatuses[(d + m) % moveStatuses.length];

      const whSrcName = warehousesList[(d + m) % warehousesList.length];
      const whDstName = warehousesList[(d + m + 1) % warehousesList.length];
      const whSrcDoc = warehouseMap.get(whSrcName);
      const whDstDoc = warehouseMap.get(whDstName);

      const itm = itemDefs[(d * 2 + m) % itemDefs.length];
      const qty = 15 + ((d * 7 + m * 11) % 65);
      const unitCost = itm.unitCost;
      const totalVal = qty * unitCost;

      movesToSeed.push({
        reference,
        tenantId: TENANT_ID,
        moveType,
        moveStatus,
        scheduledDate: moveDate,
        effectiveDate: moveDate,
        sourceLocation: {
          warehouseId: whSrcDoc?._id,
          warehouseName: whSrcName,
          zone: "Zone-A",
          bin: `B-${(d % 10) + 1}`,
        },
        destinationLocation: {
          warehouseId: whDstDoc?._id,
          warehouseName: whDstName,
          zone: "Zone-B",
          bin: `B-${(d % 10) + 2}`,
        },
        lines: [
          {
            productId: (existingProducts[0]?._id as any) || new mongoose.Types.ObjectId(),
            productName: itm.name,
            demand: qty,
            done: moveStatus === "done" ? qty : Math.floor(qty * 0.8),
            quantity: qty, // Populated for page lines reduce
            uom: itm.unit,
            unitCost,
            totalValue: totalVal,
          },
        ],
        valuation: {
          method: "fifo" as const,
          totalValue: totalVal,
          updatedAt: moveDate,
        },
        sourceDocument: `DOC-${2026000 + moveIdx}`,
        responsibleId: adminId,
        notes: `Automated logistics transfer #${moveIdx}`,
      });
    }
  }

  for (const sm of movesToSeed) {
    await StockMove.findOneAndUpdate(
      { tenantId: TENANT_ID, reference: sm.reference },
      { $set: sm },
      { upsert: true }
    );
  }
  console.log(`Seeded ${movesToSeed.length} Stock Moves across 365 days successfully.`);

  // ─────────────────────────────────────────────────────────────
  // 6. FINAL VERIFICATION
  // ─────────────────────────────────────────────────────────────
  console.log("\n=======================================================");
  console.log("FINAL INVENTORY ANALYTICS VERIFICATION COUNTS:");
  console.log("=======================================================");
  const [whCount, itemCount, batchCount, orderCount, moveCount, stockCount] = await Promise.all([
    Warehouse.countDocuments({ tenantId: TENANT_ID }),
    InventoryItem.countDocuments({ tenantId: TENANT_ID }),
    Batch.countDocuments({ tenantId: TENANT_ID }),
    InventoryOrder.countDocuments({ tenantId: TENANT_ID }),
    StockMove.countDocuments({ tenantId: TENANT_ID }),
    Stock.countDocuments({ tenantId: TENANT_ID }),
  ]);

  console.log({
    warehouses: whCount,
    inventoryItems: itemCount,
    batches: batchCount,
    inventoryOrders: orderCount,
    stockMoves: moveCount,
    stockLedgerEntries: stockCount,
  });

  console.log("\nALL INVENTORY ANALYTICS DATA SEEDING COMPLETE!");
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL ERROR during inventory analytics seeding:", err);
  process.exit(1);
});
