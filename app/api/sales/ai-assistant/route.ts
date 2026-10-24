import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { issuedInvoiceFilter } from "@/lib/sales/invoiceEligibility";
import { tryErpAssistant, safeErpError, providerFailure } from "@/lib/ai/erpAssistant";
import { getCompletedExchange, loadConversationContext, saveCompletedExchange } from "@/lib/ai/conversationContext";
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import { randomUUID } from 'crypto';
import SaleOrder from '@/models/sales/SaleOrder';
import SalesQuotation from '@/models/sales/SalesQuotation';
import DeliveryChallan from '@/models/sales/DeliveryChallan';
import Organization from '@/models/admin/Organization';
import mongoose from 'mongoose';
import { type ChatTurn } from '@/lib/ai/claude';
import { resolveTenantAiSettings, callClaudeForTenant, callClaudeForTenantStream } from '@/lib/ai/tenantAi';
import { safeContextJson } from '@/lib/ai/sanitizeContext';
import { AI_ASSISTANT_GUIDANCE } from '@/lib/ai/assistantGuidance';
import { processChatAttachments, attachmentsPromptBlock } from '@/lib/ai/chatAttachments';
import { isMongoStorageLimitError, MONGO_STORAGE_LIMIT_MESSAGE } from '@/lib/db/mongoStorageError';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;

    // The assistant page admits both `sales` and `admin` — the API must match,
    // otherwise an admin viewing the page gets a 401 on every message.
    if (!session || (role !== 'sales' && role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const incomingConversationId: string | undefined = body.conversationId;
    const requestId = typeof body.requestId === "string" && body.requestId.length <= 100 ? body.requestId : randomUUID();
    const { imageDataUrls, docTexts } = await processChatAttachments(body);
    // Accept both `message` and the legacy `query` key; allow attachment-only.
    const rawMessage: string | undefined = body.message ?? body.query;
    const message: string = rawMessage || ((imageDataUrls.length || docTexts.length) ? 'Please read the attached file(s) and help accordingly.' : '');

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (typeof message !== "string" || message.length > 8000 || (body.conversationId !== undefined && (typeof body.conversationId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.conversationId))) || (body.chatId != null && (typeof body.chatId !== "string" || !/^[a-f\d]{24}$/i.test(body.chatId)))) {
      return NextResponse.json({ error: "The message or conversation identifier is invalid.", code: "INVALID_INPUT" }, { status: 400 });
    }

    await connectDB();

    let conversationId: string = incomingConversationId || randomUUID();
    const userId = (session.user as any).id as string;

    const conversationContext = await loadConversationContext({
      tenantId, userId, role: session.user.role, module: "sales", conversationId,
      chatId: body.chatId, history: body.history, message, requestId,
    });
    const priorTurns = conversationContext.history;
    conversationId = conversationContext.conversationId;
    const completedRetry = await getCompletedExchange({ tenantId, userId, module: "sales", conversationId, requestId });
    if (completedRetry) {
      if (body.stream) return new Response(completedRetry, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "x-conversation-id": conversationId } });
      return NextResponse.json({ response: completedRetry, conversationId });
    }

    if (!body.attachments?.length && !body.attachment) {
      const erp = await tryErpAssistant({ text: message, tenantId, userId, role: session.user.role, module: "sales", conversationId, requestId });
      if (erp) {
        if (body.stream) return new Response(erp.message, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "x-conversation-id": erp.conversationId } });
        return NextResponse.json(erp);
      }
    }

    const data = await fetchSalesData(tenantId);
    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const built = buildSalesPrompt(message, data);
    const prompt = built.prompt + attachmentsPromptBlock(imageDataUrls, docTexts);
    const { systemPrompt, maxTokens } = built;

    // Streaming path — the client reads the body incrementally for an instant
    // feel and persists the conversation itself (no server-side double-save).
    if (body.stream) {
      const streamRes = await callClaudeForTenantStream(tenantId, tier, aiSettings, prompt, {
        language: { rawText: message, showInterpretation: false },
        systemPrompt,
        maxTokens,
        history: priorTurns,
        imageDataUrls: imageDataUrls.length ? imageDataUrls : undefined,
        idempotencyKey: requestId,
      });
      if (!("stream" in streamRes)) {
        return NextResponse.json(
          { error: streamRes.error, code: streamRes.code, currentTier: streamRes.currentTier, requiredAction: streamRes.requiredAction },
          { status: 403 },
        );
      }
      const encoder = new TextEncoder();
      let full = "";
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const delta of streamRes.stream) {
              full += delta;
              controller.enqueue(encoder.encode(delta));
            }
            await saveCompletedExchange({ tenantId, userId, conversationId, module: "sales", message, response: full, requestId });
          } catch {
            controller.enqueue(encoder.encode("\n\nThe AI response was interrupted. Please retry."));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "x-conversation-id": conversationId,
        },
      });
    }

    const genResult = await generateResponse(message, data, priorTurns, tenantId, tier, aiSettings, imageDataUrls, docTexts, requestId);
    // strictNullChecks is off project-wide, which breaks discriminated-union
    // narrowing on `genResult.gated` — narrowing on `"text" in genResult`
    // instead works either way (see lib/ai/claude.ts migration notes).
    if (!("text" in genResult)) {
      return NextResponse.json(
        {
          error: genResult.error,
          code: genResult.code,
          currentTier: genResult.currentTier,
          requiredAction: genResult.requiredAction,
        },
        { status: 403 }
      );
    }
    const response = genResult.text;

    await saveCompletedExchange({ tenantId, userId, conversationId, module: "sales", message, response, requestId });

    return NextResponse.json({ response, conversationId });
  } catch (error) {
    if (isMongoStorageLimitError(error)) {
      console.error('[sales-ai] MongoDB Atlas storage quota reached; request could not be completed.');
      return NextResponse.json({ error: MONGO_STORAGE_LIMIT_MESSAGE, code: 'MONGODB_STORAGE_LIMIT' }, { status: 503 });
    }
    const failure = safeErpError(error, randomUUID());
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

async function fetchSalesData(tenantId: string) {
  const orders = await (SaleOrder as any)
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const [totalOrders, issued, org] = await Promise.all([
    SaleOrder.countDocuments({ tenantId }),
    SalesInvoice.aggregate([
      { $match: { tenantId, ...issuedInvoiceFilter() } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]).exec(),
    (Organization as any).findOne({
      $or: [
        { subdomain: tenantId },
        ...(mongoose.isValidObjectId(tenantId) ? [{ _id: tenantId }] : []),
      ],
    }).select("name subdomain tier subscriptionStatus").lean(),
  ]);
  const totalRevenue = issued[0]?.total || 0;
  const productCounts: { [key: string]: number } = {};
  orders.forEach((order: any) => {
    order.orderLines?.forEach((item: any) => {
      const name = item.name || 'Unknown';
      productCounts[name] = (productCounts[name] || 0) + (item.productQty || 1);
    });
  });

  const topProducts = Object.entries(productCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const monthlyAgg = await (SalesInvoice as any)
    .aggregate([
      { $match: { tenantId, ...issuedInvoiceFilter(), invoiceDate: { $gte: start } } },
      {
        $group: {
          _id: {
            year: { $year: '$invoiceDate' },
            month: { $month: '$invoiceDate' },
          },
          total: { $sum: { $ifNull: ['$totalAmount', 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ])
    .exec();

  return {
    organization: org ? { name: org.name, subdomain: org.subdomain } : null,
    summary: {
      totalOrders,
      totalRevenue,
      revenueBasis: "Issued invoice gross value including tax, excluding drafts/cancellations",
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    },
    topProducts,
    recentOrders: orders.slice(0, 5),
    monthlyTotals: monthlyAgg,
  };
}

type GenerateResult =
  | { gated: false; text: string }
  | { gated: true; error: string; code: string; currentTier?: string; requiredAction?: string };

// Single source of truth for the prompt so the streaming and non-streaming
// paths produce identical-quality answers. Not exported — route files may only
// export HTTP handlers.
function buildSalesPrompt(message: string, data: any) {
  const prompt = `You are an expert sales AI assistant for an ERP system.

User Question: "${message}"

Available Sales and Workspace Data:
${safeContextJson(data, { maxArray: 6 })}

Instructions:
1. Answer using the provided data only. Do not invent numbers. If the user asks for their organization/company name and it is present in the workspace data, state it clearly.
2. Format currency values with ₹ (Indian ERP).
3. If the user asks for forecasts or predictions, analyze monthly trends and extrapolate.
4. Use bullet points for clarity. Be concise but complete.
5. If data is missing or insufficient, state so naturally without using internal jargon like "snapshot", "data snapshot", or "context payload". Guide the user on where in the app to find or enter it.`;

  return {
    prompt,
    systemPrompt:
      "You are a precise sales analytics assistant. For DATA questions use only the figures given (never invent numbers); for HOW-TO questions give clear step-by-step app guidance and do NOT reference raw data. NEVER print internal database IDs (partner/customer/order IDs) or raw JSON — refer to things by their human name/number. Reply organised and concise." + AI_ASSISTANT_GUIDANCE,
    maxTokens: 1024,
  };
}

async function generateResponse(
  message: string,
  data: any,
  priorTurns: ChatTurn[],
  tenantId: string,
  tier: string,
  aiSettings: Parameters<typeof callClaudeForTenant>[2],
  imageDataUrls: string[] = [],
  docTexts: string[] = [],
  requestId?: string,
): Promise<GenerateResult> {
  const built = buildSalesPrompt(message, data);
  const prompt = built.prompt + attachmentsPromptBlock(imageDataUrls, docTexts);
  const { systemPrompt, maxTokens } = built;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      language: { rawText: message, showInterpretation: false },
      systemPrompt,
      maxTokens,
      history: priorTurns,
      idempotencyKey: requestId,
      imageDataUrls: imageDataUrls.length ? imageDataUrls : undefined,
    });
    if ("text" in result) {
      return { gated: false, text: result.text };
    }
    return {
      gated: true,
      error: result.error,
      code: result.code,
      currentTier: result.currentTier,
      requiredAction: result.requiredAction,
    };
  } catch (error) {
    throw providerFailure(error);
  }
}

function generateSimpleResponse(message: string, data: any): string {
  const lowerMessage = message.toLowerCase();

  const isPredictive =
    lowerMessage.includes('next month') ||
    lowerMessage.includes('predict') ||
    lowerMessage.includes('forecast');

  if (isPredictive && data.monthlyTotals?.length > 0) {
    const prediction = predictNextMonth(data.monthlyTotals);
    return (
      `Sales forecast for next month:\n\n` +
      `• Predicted Sales: ${formatCurrency(prediction.predicted)}\n` +
      `• Current Revenue: ${formatCurrency(data.summary.totalRevenue)}\n` +
      `• Expected Change: ${prediction.changePct.toFixed(1)}%\n\n` +
      `Top Products:\n${data.topProducts.map((p: any) => `• ${p.name}: ${p.count} units`).join('\n')}`
    );
  }

  let response =
    `Sales Overview:\n\n` +
    `• Total Orders: ${data.summary.totalOrders}\n` +
    `• Total Revenue: ${formatCurrency(data.summary.totalRevenue)}\n` +
    `• Average Order Value: ${formatCurrency(data.summary.averageOrderValue)}`;

  if (data.topProducts?.length > 0) {
    response += `\n\nTop Products:\n${data.topProducts.map((p: any) => `• ${p.name}: ${p.count} units`).join('\n')}`;
  }

  return response;
}

function predictNextMonth(monthlyData: any[]) {
  const vals = monthlyData.map((m: any) => m.total || 0);
  const n = vals.length;
  if (n === 0) return { predicted: 0, changePct: 0 };

  const xs = vals.map((_, i) => i);
  const sumX = xs.reduce((a: number, b: number) => a + b, 0);
  const sumY = vals.reduce((a: number, b: number) => a + b, 0);
  const sumXY = xs.reduce((s: number, x: number, i: number) => s + x * vals[i], 0);
  const sumXX = xs.reduce((s: number, x: number) => s + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  let slope = 0;
  if (denom !== 0) slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const predicted = Math.max(0, intercept + slope * n);
  const last = vals[n - 1] || 0;
  const changePct = last > 0 ? ((predicted - last) / last) * 100 : 0;

  return { predicted, changePct };
}

function formatCurrency(num: number) {
  return '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
