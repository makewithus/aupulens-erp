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
import { callClaude, callClaudeWithHistory, type ChatTurn } from "@/lib/ai/claude";
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
    const response = await generateResponseWithClaude(
      message,
      data,
      intent,
      simulationResult,
      priorTurns
    );

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

async function generateResponseWithClaude(
  message: string,
  data: any,
  intent: QueryIntent,
  simulationResult: any,
  priorTurns: ChatTurn[] = []
): Promise<string> {
  if (data.error) {
    return "I encountered an error while fetching your data. Please try again.";
  }

  const simulationSection = simulationResult
    ? `\nFINANCIAL SIMULATION RESULT:\n${JSON.stringify(simulationResult, null, 2)}\n`
    : "";

  const prompt = `You are an expert business intelligence assistant for an ERP system.

USER QUESTION: "${message}"
DATA CATEGORY: ${intent.category}
ACTION: ${intent.action}

LIVE ERP DATA:
${JSON.stringify(data, null, 2)}
${simulationSection}
INSTRUCTIONS:
1. Answer the question using the provided data only. Do not hallucinate figures.
2. Format currency values with the ₹ symbol (this is an Indian ERP).
3. If a financial simulation was run, explain what would change and by how much.
4. Use bullet points for clarity. Be concise but complete.
5. If data is missing or insufficient, say so clearly.`;

  const opts = {
    systemPrompt: "You are a precise ERP analytics assistant. Use only the data provided. Never invent numbers.",
    maxTokens: 1024,
  };

  try {
    if (priorTurns.length > 0) {
      return await callClaudeWithHistory(priorTurns, prompt, opts);
    }
    return await callClaude(prompt, opts);
  } catch {
    return generateSimpleFallback(data, intent);
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
