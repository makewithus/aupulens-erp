import mongoose from "mongoose";
import Product from "@/models/inventory/Product";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { ErpToolError, escapeRegex, currency, flexibleNameRegex, requireSalesAccess } from "./erpQuery";
import { normalizeErpText } from "./erpIntent";
import { AI_ACTION_STATUS as A, PRODUCT_STATUS } from "@/lib/constants/statuses";

type Scope = { tenantId: string; userId: string; role: string; conversationId: string };

export interface ProductDraftParams {
  name: string;
  default_code?: string;
  selling_price: number;
  cost_price?: number;
  gst_rate?: number;
  hsn_code?: string;
  conversationId: string;
  executing?: boolean;
}

export function extractProductFields(text: string): {
  name?: string;
  default_code?: string;
  selling_price?: number;
  cost_price?: number;
  gst_rate?: number;
  hsn_code?: string;
} {
  const q = normalizeErpText(text).trim();
  const fields: ReturnType<typeof extractProductFields> = {};

  // 1. Selling price
  const sellMatch = q.match(/\b(?:selling\s+price|sale\s+price|list\s+price|price|mrp)\s*(?:is|to|:|=)?\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (sellMatch) fields.selling_price = Number(sellMatch[1]);

  // 2. Unit cost / Cost price
  const costMatch = q.match(/\b(?:unit\s+cost|cost\s+price|standard\s+price|cost)\s*(?:is|to|:|=)?\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (costMatch) fields.cost_price = Number(costMatch[1]);

  // 3. GST rate
  const gstMatch = q.match(/\bgst\s*(?:rate)?\s*(?:is|to|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
                   q.match(/\bgst\s*(?:rate)?\s*(?:is|to|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\b/i);
  if (gstMatch) fields.gst_rate = Number(gstMatch[1]);

  // 4. HSN code
  const hsnMatch = q.match(/\b(?:hsn|sac)(?:\s+code)?\s*(?:is|to|:|=)?\s*([0-9A-Za-z]+)\b/i);
  if (hsnMatch) fields.hsn_code = hsnMatch[1].trim();

  // 5. Product name / code
  // Match patterns like:
  // "product CLOUD-TEST-AI-PROD-01"
  // "naya product CLOUD-TEST-AI-PROD-01 banao"
  // "create product CLOUD-TEST-AI-PROD-01"
  const explicitProd = q.match(/\b(?:product|item)\s+(?:code\s+|name\s+|named\s+|called\s+)?([A-Za-z0-9_-]+)/i);
  if (explicitProd) {
    const val = explicitProd[1].trim();
    if (!/^(?:create|make|add|new|draft|banao|banayein|karo|taiyar|banana|selling|cost|price|gst|hsn)$/i.test(val)) {
      fields.name = val;
      fields.default_code = val;
    }
  }

  // Also check if any standalone token looks like a product code: e.g. CLOUD-TEST-AI-PROD-01
  if (!fields.name) {
    const codeToken = q.match(/\b([A-Z0-9]+-[A-Z0-9_-]+)\b/i);
    if (codeToken) {
      fields.name = codeToken[1].trim();
      fields.default_code = codeToken[1].trim();
    }
  }

  return fields;
}

export function productDraftSummary(params: ProductDraftParams): string {
  let msg = `Product draft — not saved:\n\nName: ${params.name}\nCode: ${params.default_code || params.name}\nSelling Price: ${currency(params.selling_price)}`;
  if (params.cost_price !== undefined) msg += `\nUnit Cost: ${currency(params.cost_price)}`;
  if (params.gst_rate !== undefined) msg += `\nGST: ${params.gst_rate}%`;
  if (params.hsn_code) msg += `\nHSN: ${params.hsn_code}`;

  msg += `\n\nConfirm product to save, or cancel product.`;
  return msg;
}

export async function prepareProductDraft(scope: Scope, text: string, requestId: string) {
  requireSalesAccess(scope.role);
  const extracted = extractProductFields(text);

  if (!extracted.name) {
    throw new ErpToolError("MISSING_FIELD", "What is the product name or product code?");
  }
  if (extracted.selling_price === undefined || isNaN(extracted.selling_price) || extracted.selling_price <= 0) {
    throw new ErpToolError("MISSING_FIELD", "What is the selling price for this product?");
  }
  if (extracted.cost_price !== undefined && (isNaN(extracted.cost_price) || extracted.cost_price < 0)) {
    throw new ErpToolError("BUSINESS_RULE", "Unit cost must be a non-negative number.");
  }
  if (extracted.gst_rate !== undefined && (isNaN(extracted.gst_rate) || extracted.gst_rate < 0 || extracted.gst_rate > 100)) {
    throw new ErpToolError("BUSINESS_RULE", "GST rate must be between 0% and 100%.");
  }

  // Check if product code already exists in this tenant
  const existing = await Product.findOne({
    tenantId: scope.tenantId,
    $or: [
      { "tab_general_information.default_code": extracted.default_code || extracted.name },
      { "header.name": extracted.name },
    ],
  }).lean();

  if (existing) {
    throw new ErpToolError("BUSINESS_RULE", `A product with name or code "${extracted.name}" already exists in your workspace.`);
  }

  const params: ProductDraftParams = {
    name: extracted.name,
    default_code: extracted.default_code || extracted.name,
    selling_price: extracted.selling_price,
    cost_price: extracted.cost_price,
    gst_rate: extracted.gst_rate,
    hsn_code: extracted.hsn_code,
    conversationId: scope.conversationId,
  };

  const summary = productDraftSummary(params);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  const proposal = await AiCommandProposal.create({
    tenantId: scope.tenantId,
    userId: scope.userId,
    module: "inventory",
    actionType: "create_product_draft",
    destructive: false,
    params,
    preview: { ...params },
    summary,
    status: A.PROPOSED,
    expiresAt,
  });

  return {
    proposalId: String(proposal._id),
    name: params.name,
    code: params.default_code,
    sellingPrice: params.selling_price,
    costPrice: params.cost_price,
    gstRate: params.gst_rate,
    hsnCode: params.hsn_code,
    message: summary,
  };
}

export async function confirmProductDraft(scope: Scope, proposalId: string) {
  requireSalesAccess(scope.role);
  const proposal = await AiCommandProposal.findOne({
    _id: proposalId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    actionType: "create_product_draft",
  });

  if (!proposal) throw new ErpToolError("NOT_FOUND", "Product draft not found.");

  // Idempotency: if already executed, return existing product
  if (proposal.status === A.EXECUTED && proposal.resultRef) {
    const existing = await Product.findOne({ _id: proposal.resultRef, tenantId: scope.tenantId }).lean();
    if (existing) {
      return {
        productId: String(existing._id),
        name: (existing as any).header?.name,
        code: (existing as any).tab_general_information?.default_code,
        price: (existing as any).tab_general_information?.list_price,
        route: "/inventory/products",
      };
    }
  }

  if (proposal.status !== A.PROPOSED) {
    throw new ErpToolError("BUSINESS_RULE", `This product draft is ${proposal.status} and cannot be saved.`);
  }

  const locked = await AiCommandProposal.findOneAndUpdate(
    { _id: proposalId, status: A.PROPOSED, "params.executing": { $ne: true } },
    { $set: { "params.executing": true } },
    { new: true }
  );

  if (!locked) {
    throw new ErpToolError("BUSINESS_RULE", "This product creation is already being processed.");
  }

  const params = (locked.params || {}) as unknown as ProductDraftParams;
  const name = params.name.trim();

  const doc = await Product.create({
    tenantId: scope.tenantId,
    createdBy: new mongoose.Types.ObjectId(scope.userId),
    header: {
      name,
      sale_ok: true,
      purchase_ok: true,
      can_be_expensed: false,
    },
    allowNegativeStock: false,
    tab_general_information: {
      type: "consu",
      invoice_policy: "order",
      service_upsell: false,
      list_price: params.selling_price,
      standard_price: params.cost_price ?? 0,
      default_code: params.default_code || name,
      gstRate: params.gst_rate ?? 0,
      hsnSacCode: params.hsn_code || undefined,
      taxes_id: [],
    },
    status: PRODUCT_STATUS.PUBLISHED,
  });

  await CrmAuditLog.create({
    tenantId: scope.tenantId,
    user_id: scope.userId,
    action: "created",
    record_type: "Product",
    record_id: doc._id,
    new_value: `${name} (Selling: ${params.selling_price}, Cost: ${params.cost_price ?? 0})`,
  });

  locked.status = A.EXECUTED;
  locked.resultRef = String(doc._id);
  locked.executedAt = new Date();
  await locked.save();

  return {
    productId: String(doc._id),
    name: doc.header.name,
    code: doc.tab_general_information.default_code,
    price: doc.tab_general_information.list_price,
    route: "/inventory/products",
    message: `Product "${doc.header.name}" created successfully with selling price ${currency(doc.tab_general_information.list_price)}.`,
  };
}

export async function cancelProductDraft(scope: Scope, proposalId: string) {
  requireSalesAccess(scope.role);
  await AiCommandProposal.updateOne(
    { _id: proposalId, tenantId: scope.tenantId, userId: scope.userId, status: A.PROPOSED },
    { $set: { status: A.REJECTED } }
  );
  return "Product draft cancelled. No product record was created.";
}

export async function prepareProductPriceUpdate(scope: Scope, productQuery: string, oldPrice: number, newPrice: number) {
  requireSalesAccess(scope.role);
  const q = productQuery.trim();
  if (!q || !Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || oldPrice < 0 || newPrice < 0) {
    throw new ErpToolError("INVALID_INPUT", "Provide a product and valid old and new selling prices.");
  }
  const products = await Product.find({ tenantId: scope.tenantId, $or: [
    { "tab_general_information.default_code": { $regex: `^${escapeRegex(q)}$`, $options: "i" } },
    { "header.name": flexibleNameRegex(q) },
  ] }).select("header.name tab_general_information.default_code tab_general_information.list_price").limit(3).lean();
  if (products.length === 0) throw new ErpToolError("NOT_FOUND", `No product matching “${q}” was found in your workspace.`, 404);
  if (products.length > 1) throw new ErpToolError("AMBIGUOUS_MATCH", `More than one product matches “${q}”. Use its exact catalog name or code.`, 409);
  const product: any = products[0];
  const currentPrice = Number(product.tab_general_information?.list_price) || 0;
  if (Math.abs(currentPrice - oldPrice) > 0.005) throw new ErpToolError("BUSINESS_RULE", `The catalog price for “${product.header?.name}” is ${currency(currentPrice)}, not ${currency(oldPrice)}. No change was prepared.`);
  const name = product.header?.name || "Product";
  const code = product.tab_general_information?.default_code || "";
  const summary = `Update Product Selling Price — not saved:\n\nProduct: ${name}${code ? ` (${code})` : ""}\nCurrent Price: ${currency(currentPrice)}\nNew Price: ${currency(newPrice)}\n\nConfirm to apply this update, or cancel to discard.`;
  const proposal = await AiCommandProposal.create({
    tenantId: scope.tenantId, userId: scope.userId, module: "inventory", actionType: "update_product_price", destructive: false,
    params: { productId: String(product._id), productName: name, code, oldPrice: currentPrice, newPrice, conversationId: scope.conversationId },
    preview: { productId: String(product._id), productName: name, code, oldPrice: currentPrice, newPrice },
    summary, status: A.PROPOSED, expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  });
  return { proposalId: String(proposal._id), productId: String(product._id), name, code, oldPrice: currentPrice, newPrice, message: summary };
}

export async function confirmProductPriceUpdate(scope: Scope, proposalId: string) {
  requireSalesAccess(scope.role);
  const proposal = await AiCommandProposal.findOne({ _id: proposalId, tenantId: scope.tenantId, userId: scope.userId, actionType: "update_product_price" });
  if (!proposal) throw new ErpToolError("NOT_FOUND", "Product price update proposal not found.");
  if (proposal.status !== A.PROPOSED) throw new ErpToolError("BUSINESS_RULE", `This update proposal is ${proposal.status} and cannot be executed.`);
  const locked = await AiCommandProposal.findOneAndUpdate({ _id: proposalId, status: A.PROPOSED, "params.executing": { $ne: true } }, { $set: { "params.executing": true } }, { new: true });
  if (!locked) throw new ErpToolError("BUSINESS_RULE", "This product update is already being processed.");
  const params = locked.params as any;
  const product = await Product.findOne({ _id: params.productId, tenantId: scope.tenantId });
  if (!product) throw new ErpToolError("NOT_FOUND", "Product no longer exists.");
  const currentPrice = Number(product.tab_general_information?.list_price) || 0;
  if (Math.abs(currentPrice - Number(params.oldPrice)) > 0.005) throw new ErpToolError("BUSINESS_RULE", "The catalog price changed after this preview. Prepare the update again to review the latest value.");
  product.tab_general_information.list_price = Number(params.newPrice);
  await product.save();
  await CrmAuditLog.create({ tenantId: scope.tenantId, user_id: scope.userId, action: "updated", record_type: "Product", record_id: product._id, old_value: String(params.oldPrice), new_value: String(params.newPrice) });
  locked.status = A.EXECUTED;
  locked.resultRef = String(product._id);
  locked.executedAt = new Date();
  await locked.save();
  return { productId: String(product._id), name: product.header.name, code: product.tab_general_information.default_code, price: product.tab_general_information.list_price, route: "/inventory/products", message: `Product “${product.header.name}” selling price updated to ${currency(product.tab_general_information.list_price)}.` };
}

export async function cancelProductPriceUpdate(scope: Scope, proposalId: string) {
  requireSalesAccess(scope.role);
  await AiCommandProposal.updateOne({ _id: proposalId, tenantId: scope.tenantId, userId: scope.userId, actionType: "update_product_price", status: A.PROPOSED }, { $set: { status: A.REJECTED } });
  return "Product price update cancelled. The catalog price remains unchanged.";
}
