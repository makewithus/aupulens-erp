import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { randomUUID } from "crypto";
import {
  fetchAdminFinanceData,
  fetchAdminSalesData,
  fetchAdminInventoryData,
  fetchAdminManufacturingData,
  fetchAdminUsersData,
  fetchAdminGeneralData,
} from "@/lib/ai/adminDataFetcher";
import { callClaude, type ChatTurn } from "@/lib/ai/claude";
import { resolveTenantAiSettings, callClaudeForTenant, callClaudeForTenantStream } from "@/lib/ai/tenantAi";
import { safeContextJson } from "@/lib/ai/sanitizeContext";
import { AI_ASSISTANT_GUIDANCE } from '@/lib/ai/assistantGuidance';
import { extractAttachment } from "@/lib/ai/extractFile";
import { extractContent, validateDocument } from "@/lib/docIntel/textExtract";
import { extractDocument } from "@/lib/docIntel/extractor";
import { DOC_INTEL_TYPE, DOC_INTEL_STATUS } from "@/lib/docIntel/extractionSchemas";
import ExtractedDocument from "@/models/ExtractedDocument";
import ChatHistory from "@/models/ChatHistory";

interface QueryIntent {
  category: string;
  action: string;
  filters?: any;
  financialParams?: {
    metric: string;
    change: number;
    target: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationId: incomingConversationId } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Resolve or create a conversationId
    const conversationId: string = incomingConversationId || randomUUID();
    const userId = (session.user as any).id as string;

    // Restore prior turns for multi-turn context
    const existingHistory = await ChatHistory.findOne(
      { tenantId, conversationId },
      { messages: 1 }
    ).lean();
    const priorTurns: ChatTurn[] = (existingHistory?.messages ?? []).map(
      (m: any) => ({ role: m.role, content: m.content })
    );

    // ── Attachment path (one or more PDFs / DOCX / images) ───────────────────
    // Reads every attached file — documents become text, images go to gpt-4o
    // vision — and answers about them. Always streamed. Accepts the new
    // `attachments` array and the legacy single `attachment` for back-compat.
    const rawAtts: Array<{ name?: string; type: string; dataUrl: string }> =
      Array.isArray(body.attachments) ? body.attachments : (body.attachment ? [body.attachment] : []);
    const atts = rawAtts.filter((a) => a?.dataUrl && a?.type).slice(0, 8);
    if (atts.length > 0) {
      const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
      const enc0 = new TextEncoder();
      const txtHeaders = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "x-conversation-id": conversationId };
      const bufferOf = (a: { dataUrl: string }) => {
        const base64 = a.dataUrl.includes(",") ? a.dataUrl.split(",")[1] : a.dataUrl;
        return Buffer.from(base64, "base64");
      };

      // ── Create-a-bill-from-document intent (uses the FIRST document) ─────────
      const wantsBill =
        /\b(create|make|generate|add|book|record|prepare|draft|extract)\b/i.test(message) &&
        /\b(bill|invoice|expense|voucher|vendor|purchase)\b/i.test(message);
      if (wantsBill) {
        const att = atts[0];
        const fileErr = validateDocument(att.name || "document");
        if (fileErr) return new Response(enc0.encode(fileErr), { headers: txtHeaders });
        let content;
        try {
          content = await extractContent(att.name || "document", bufferOf(att));
        } catch (e: any) {
          return new Response(enc0.encode(`I couldn't read that document: ${e?.message || "unreadable"}.`), { headers: txtHeaders });
        }
        const outcome = await extractDocument(tenantId, DOC_INTEL_TYPE.VENDOR_BILL, content);
        if (!("data" in outcome)) {
          return new Response(enc0.encode(`I couldn't extract the bill details: ${outcome.error}`), { headers: txtHeaders });
        }
        const staged = await ExtractedDocument.create({
          tenantId,
          docType: DOC_INTEL_TYPE.VENDOR_BILL,
          fileName: att.name || "document",
          status: DOC_INTEL_STATUS.EXTRACTED,
          extraction: outcome.data as unknown as Record<string, unknown>,
          aiConfidence: (outcome.data as any).confidence,
          createdBy: userId,
        });
        const d: any = outcome.data;
        const extra = atts.length > 1 ? `\n\n_(I used the first of ${atts.length} files. To create separate bills, send them one at a time.)_` : "";
        const msg = `I've read **${att.name || "your document"}** and prepared a **draft vendor bill** for your review (nothing has been posted yet):\n\n- **Vendor:** ${d.vendorName || "\u2014"}\n- **Bill #:** ${d.billNumber || "\u2014"}\n- **Bill date:** ${d.billDate || "\u2014"}\n- **Total:** \u20b9${Number(d.totalAmount || 0).toLocaleString("en-IN")}\n\nReview the extracted fields and confirm to create the bill here: [Open Document Intelligence](/document-intelligence).${extra}`;
        void staged;
        return new Response(enc0.encode(msg), { headers: txtHeaders });
      }

      // ── General: read every attachment (docs \u2192 text, images \u2192 vision) ──
      const imageUrls: string[] = [];
      const docTexts: string[] = [];
      const unsupported: string[] = [];
      for (const a of atts) {
        const extracted = await extractAttachment(bufferOf(a), a.type, a.name || "");
        if (extracted.kind === "image") imageUrls.push(a.dataUrl);
        else if (extracted.kind === "text") docTexts.push(`=== ${a.name || "document"} ===\n${(extracted as any).text}`);
        else unsupported.push(a.name || "a file");
      }
      if (imageUrls.length === 0 && docTexts.length === 0) {
        return NextResponse.json({ error: `I couldn't read the attached file(s)${unsupported.length ? `: ${unsupported.join(", ")}` : ""}.` }, { status: 200 });
      }

      const parts: string[] = [`The user attached ${atts.length} file(s).`];
      if (docTexts.length) parts.push("Document content is below.");
      if (imageUrls.length) parts.push(`${imageUrls.length} image(s) are attached for you to look at.`);
      const attachPrompt = `${parts.join(" ")} Answer using ONLY the attached content (text + images); if the answer isn't present, say so.\n\n${docTexts.join("\n\n")}\n\nUSER QUESTION: "${message}"`;

      const streamRes = await callClaudeForTenantStream(tenantId, tier, aiSettings, attachPrompt, {
        systemPrompt: "You are Aupulens' assistant analysing one or more user-attached files. Be accurate, organised and concise. Never print internal database IDs or raw JSON." + AI_ASSISTANT_GUIDANCE,
        maxTokens: 1100,
        imageDataUrls: imageUrls.length ? imageUrls : undefined,
        history: priorTurns,
      });
      if (!("stream" in streamRes)) {
        return NextResponse.json({ error: streamRes.error, code: streamRes.code }, { status: 403 });
      }
      const enc = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try { for await (const d of streamRes.stream) controller.enqueue(enc.encode(d)); }
          catch { controller.enqueue(enc.encode("Sorry \u2014 I couldn't finish reading those attachments. Please try again.")); }
          finally { controller.close(); }
        },
      });
      return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "x-conversation-id": conversationId } });
    }

    // Classify the query to decide which data set to fetch
    const intent = await analyzeQueryIntent(message);

    // Fetch tenant-scoped data for the relevant category
    const data = await fetchDataBasedOnIntent(intent, tenantId);

    // Optional financial simulation for "what-if" queries
    let simulationResult = null;
    if (intent.action === "model" && intent.financialParams) {
      simulationResult = performFinancialSimulation(data, intent.financialParams);
    }

    // Generate the natural-language response via Claude (with conversation history)
    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);

    // ── Streaming path (ChatGPT-style token-by-token) ────────────────────────
    // The client sends { stream: true } and reads the response body as it
    // arrives. Same prompt/quality as the non-stream path; persists the turns
    // to ChatHistory once the stream finishes.
    if (body.stream) {
      const built = buildAdminPrompt(message, data, simulationResult);
      if (!built) {
        return NextResponse.json({ error: "I encountered an error while fetching your data. Please try again." }, { status: 200 });
      }
      const streamRes = await callClaudeForTenantStream(tenantId, tier, aiSettings, built.prompt, {
        systemPrompt: built.systemPrompt,
        maxTokens: built.maxTokens,
        history: priorTurns,
      });
      // strictNullChecks is off — narrow on "stream" in result, not .gated.
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
          } catch {
            // If the model errors mid-stream, end gracefully with what we have.
            if (!full) controller.enqueue(encoder.encode("Sorry — I couldn't complete that response. Please try again."));
          } finally {
            controller.close();
            // The client persists the conversation (same as the non-stream
            // path) — no server-side save here, to avoid duplicate records.
          }
        },
      });
      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "x-conversation-id": conversationId },
      });
    }

    const genResult = await generateResponseWithClaude(
      message,
      data,
      intent,
      simulationResult,
      priorTurns,
      tenantId,
      tier,
      aiSettings
    );
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

    // Persist both turns to ChatHistory (upsert by tenantId + conversationId)
    const now = new Date();
    await ChatHistory.findOneAndUpdate(
      { tenantId, conversationId },
      {
        $setOnInsert: {
          tenantId,
          conversationId,
          userId,
          module: "admin",
          title: message.slice(0, 80),
        },
        $push: {
          messages: {
            $each: [
              { role: "user",      content: message,  timestamp: now },
              { role: "assistant", content: response, timestamp: new Date(now.getTime() + 1) },
            ],
          },
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ response, conversationId });
  } catch (error) {
    console.error("AI Assistant Error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

// ─── Intent Classification ────────────────────────────────────────────────────

async function analyzeQueryIntent(message: string): Promise<QueryIntent> {
  try {
    const prompt = `Analyze this ERP business query and reply ONLY with a valid JSON object. No prose, no markdown fences.

Format:
{
  "category": "finance|sales|inventory|manufacturing|users|general",
  "action": "summary|list|count|trend|specific|model|predict",
  "filters": { "dateRange": "last_month|this_year|etc", "entity": "product_name" },
  "financialParams": { "metric": "price|cost|volume", "change": 0.10, "target": "revenue|profit" }
}

Include "financialParams" only when action is "model". Omit "filters" when not applicable.

Query: "${message}"`;

    const text = await callClaude(prompt, {
      systemPrompt:
        "You are an ERP query classifier. Reply only with the JSON object — no explanation, no markdown.",
      maxTokens: 256,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as QueryIntent;
    }
    return simpleIntentAnalysis(message);
  } catch {
    return simpleIntentAnalysis(message);
  }
}

function simpleIntentAnalysis(message: string): QueryIntent {
  const lower = message.toLowerCase();

  if (lower.includes("what if") || lower.includes("scenario") || lower.includes("simulate")) {
    return { category: "sales", action: "model", financialParams: { metric: "price", change: 0.1, target: "revenue" } };
  }
  if (lower.includes("next month") || lower.includes("predict") || lower.includes("forecast")) {
    return { category: "sales", action: "predict" };
  }
  if (lower.includes("revenue") || lower.includes("finance") || lower.includes("expense") || lower.includes("transaction")) {
    return { category: "finance", action: "summary" };
  }
  if (lower.includes("sales") || lower.includes("order") || lower.includes("product") || lower.includes("customer")) {
    return { category: "sales", action: "summary" };
  }
  if (lower.includes("inventory") || lower.includes("stock") || lower.includes("warehouse")) {
    return { category: "inventory", action: "summary" };
  }
  if (lower.includes("shipment") || lower.includes("manufacturing") || lower.includes("freight")) {
    return { category: "manufacturing", action: "summary" };
  }
  if (lower.includes("user") || lower.includes("employee")) {
    return { category: "users", action: "count" };
  }
  return { category: "general", action: "summary" };
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

async function fetchDataBasedOnIntent(intent: QueryIntent, tenantId: string): Promise<any> {
  try {
    switch (intent.category) {
      case "finance":      return await fetchAdminFinanceData(tenantId);
      case "sales":        return await fetchAdminSalesData(tenantId);
      case "inventory":    return await fetchAdminInventoryData(tenantId);
      case "manufacturing": return await fetchAdminManufacturingData(tenantId);
      case "users":        return await fetchAdminUsersData(tenantId);
      default:             return await fetchAdminGeneralData(tenantId);
    }
  } catch (error) {
    console.error("Data fetch error:", error);
    return { error: "Failed to fetch data" };
  }
}

// ─── Financial Simulation ─────────────────────────────────────────────────────

function performFinancialSimulation(data: any, params: any) {
  const currentRevenue = data.summary?.totalRevenue || 0;
  const currentCost = currentRevenue * 0.6;
  const currentProfit = currentRevenue - currentCost;

  let newRevenue = currentRevenue;
  let newCost = currentCost;

  if (params.metric === "price") {
    const volumeChange = -(params.change * 0.5);
    newRevenue = currentRevenue * (1 + params.change) * (1 + volumeChange);
  } else if (params.metric === "cost") {
    newCost = currentCost * (1 + params.change);
  } else if (params.metric === "volume") {
    newRevenue = currentRevenue * (1 + params.change);
    newCost = currentCost * (1 + params.change);
  }

  const newProfit = newRevenue - newCost;
  return {
    original: { revenue: currentRevenue, profit: currentProfit },
    simulated: { revenue: newRevenue, profit: newProfit },
    change: {
      revenue: currentRevenue ? ((newRevenue - currentRevenue) / currentRevenue) * 100 : 0,
      profit: currentProfit ? ((newProfit - currentProfit) / currentProfit) * 100 : 0,
    },
  };
}

// ─── Response Generation (Claude) ────────────────────────────────────────────

type GenerateResult =
  | { gated: false; text: string }
  | { gated: true; error: string; code: string; currentTier?: string; requiredAction?: string };

/**
 * Build the sanitized prompt + options for the main answer. Shared by the
 * non-streaming and streaming code paths so both produce identical-quality
 * answers. Returns null when the fetched data errored.
 */
function buildAdminPrompt(
  message: string,
  data: any,
  simulationResult: any,
): { prompt: string; systemPrompt: string; maxTokens: number } | null {
  if (data?.error) return null;

  const simulationSection = simulationResult
    ? `\nFINANCIAL SIMULATION RESULT (already computed — explain it):\n${safeContextJson(simulationResult)}\n`
    : "";
  const summaryOnly = (data && typeof data === "object" && "summary" in data) ? { summary: (data as any).summary } : data;
  const safeData = safeContextJson(summaryOnly, { maxArray: 6 });

  const prompt = `USER QUESTION: "${message}"

WORKSPACE SNAPSHOT (aggregate figures only — for answering data questions):
${safeData}
${simulationSection}
Decide what kind of question this is and answer accordingly:

• If it's a DATA / ANALYTICS question ("how many…", "what's my revenue…",
  "show me…"): answer using ONLY the figures in the snapshot above. Never invent
  numbers. Format money with ₹.

• If it's a HOW-TO / HELP question ("how do I create a lead", "where do I…"):
  give clear, numbered, step-by-step guidance for using the Aupulens ERP app —
  which page/menu to open and what to fill in. Do NOT reference the snapshot data
  and do NOT show any record values or codes for this type of question.

Rules for EVERY answer:
1. Answer directly — do NOT announce which type of question it is.
2. Never expose internal identifiers (database IDs, partner/customer/order IDs) —
   refer to things by their human name/number instead.
3. Be well-organised: a one-line summary, then tight bullet points or numbered
   steps. No rambling, no raw JSON.
4. If the snapshot lacks what's needed, say so briefly and suggest where to look.`;

  return {
    prompt,
    systemPrompt:
      "You are Aupulens' precise ERP assistant. Answer like a helpful product expert: organised, concise, and accurate. For data questions use only the figures given (never invent numbers); for how-to questions give clear app navigation steps. NEVER print internal database IDs or raw JSON in your reply." + AI_ASSISTANT_GUIDANCE,
    maxTokens: 700,
  };
}

async function generateResponseWithClaude(
  message: string,
  data: any,
  intent: QueryIntent,
  simulationResult: any,
  priorTurns: ChatTurn[],
  tenantId: string,
  tier: string,
  aiSettings: Parameters<typeof callClaudeForTenant>[2]
): Promise<GenerateResult> {
  const built = buildAdminPrompt(message, data, simulationResult);
  if (!built) {
    return { gated: false, text: "I encountered an error while fetching your data. Please try again." };
  }
  const { prompt, systemPrompt, maxTokens } = built;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt,
      maxTokens,
      history: priorTurns,
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
  } catch {
    return { gated: false, text: generateSimpleFallback(data, intent) };
  }
}

function generateSimpleFallback(data: any, intent: QueryIntent): string {
  const fmt = (n: number) =>
    "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  if (intent.category === "finance") {
    return `Finance summary:\n\n• Total Revenue: ${fmt(data.summary?.totalRevenue)}\n• Total Transactions: ${data.summary?.totalTransactions || 0}\n• Recent Invoices: ${data.summary?.recentInvoices || 0}`;
  }
  if (intent.category === "sales") {
    return `Sales overview:\n\n• Total Orders: ${data.summary?.totalOrders || 0}\n• Total Revenue: ${fmt(data.summary?.totalRevenue)}\n• Avg Order Value: ${fmt(data.summary?.averageOrderValue || 0)}`;
  }
  if (intent.category === "inventory") {
    return `Inventory:\n\n• Total Items: ${data.summary?.totalItems || 0}\n• Low Stock: ${data.summary?.lowStockCount || 0}\n• Out of Stock: ${data.summary?.outOfStockCount || 0}`;
  }
  if (intent.category === "manufacturing") {
    return `Manufacturing:\n\n• Total Shipments: ${data.summary?.totalShipments || 0}`;
  }
  if (intent.category === "users") {
    return `Users:\n\n• Total: ${data.summary?.totalUsers || 0}`;
  }
  return `ERP Overview:\n\n• Users: ${data.summary?.totalUsers || 0}\n• Orders: ${data.summary?.totalOrders || 0}\n• Inventory Items: ${data.summary?.totalInventoryItems || 0}`;
}
