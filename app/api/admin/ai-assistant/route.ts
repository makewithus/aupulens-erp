import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import {
  fetchAdminFinanceData,
  fetchAdminSalesData,
  fetchAdminInventoryData,
  fetchAdminManufacturingData,
  fetchAdminUsersData,
  fetchAdminGeneralData,
} from "@/lib/ai/adminDataFetcher";

// Replace with your actual Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

interface QueryIntent {
  category: string;
  action: string;
  filters?: any;
  financialParams?: {
    metric: string;
    change: number; // percentage or absolute
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

    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Analyze the query using Gemini to determine what data to fetch
    const intent = await analyzeQueryIntent(message);

    // Fetch relevant data from database based on intent
    const data = await fetchDataBasedOnIntent(intent, tenantId);

    // If financial modeling is requested, perform simulation
    let simulationResult = null;
    if (intent.action === "model" && intent.financialParams) {
      simulationResult = performFinancialSimulation(
        data,
        intent.financialParams
      );
    }

    // Generate response using Gemini with the fetched data
    const response = await generateResponseWithGemini(
      message,
      data,
      intent,
      simulationResult
    );

    return NextResponse.json({ response });
  } catch (error) {
    console.error("AI Assistant Error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

async function analyzeQueryIntent(message: string): Promise<QueryIntent> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "") {
    return simpleIntentAnalysis(message);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze this business query. Reply ONLY with a JSON object.
Format:
{
  "category": "finance|sales|inventory|manufacturing|users|general",
  "action": "summary|list|count|trend|specific|model",
  "filters": { "dateRange": "last_month|this_year|etc", "entity": "product_name" },
  "financialParams": { "metric": "price|cost|volume", "change": 0.10, "target": "revenue|profit" } (ONLY if action is 'model')
}

Query: "${message}"`,
                },
              ],
            },
          ],
        }),
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return simpleIntentAnalysis(message);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return simpleIntentAnalysis(message);
  } catch (error) {
    console.error("Intent analysis error:", error);
    return simpleIntentAnalysis(message);
  }
}

function simpleIntentAnalysis(message: string): QueryIntent {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("what if") ||
    lowerMessage.includes("scenario") ||
    lowerMessage.includes("simulate")
  ) {
    return {
      category: "sales",
      action: "model",
      financialParams: { metric: "price", change: 0.1, target: "revenue" },
    };
  }

  if (
    lowerMessage.includes("next month") ||
    lowerMessage.includes("predict") ||
    lowerMessage.includes("forecast")
  ) {
    return { category: "sales", action: "predict" };
  }

  if (
    lowerMessage.includes("revenue") ||
    lowerMessage.includes("finance") ||
    lowerMessage.includes("expense") ||
    lowerMessage.includes("transaction")
  ) {
    return { category: "finance", action: "summary" };
  }

  if (
    lowerMessage.includes("sales") ||
    lowerMessage.includes("order") ||
    lowerMessage.includes("product") ||
    lowerMessage.includes("customer")
  ) {
    return { category: "sales", action: "summary" };
  }

  if (
    lowerMessage.includes("inventory") ||
    lowerMessage.includes("stock") ||
    lowerMessage.includes("warehouse")
  ) {
    return { category: "inventory", action: "summary" };
  }

  if (
    lowerMessage.includes("shipment") ||
    lowerMessage.includes("manufacturing") ||
    lowerMessage.includes("freight")
  ) {
    return { category: "manufacturing", action: "summary" };
  }

  if (lowerMessage.includes("user") || lowerMessage.includes("employee")) {
    return { category: "users", action: "count" };
  }

  return { category: "general", action: "summary" };
}

function performFinancialSimulation(data: any, params: any) {
  // Simple simulation logic
  const currentRevenue = data.summary?.totalRevenue || 0;
  const currentCost = currentRevenue * 0.6; // Assumption: 60% cost
  const currentProfit = currentRevenue - currentCost;

  let newRevenue = currentRevenue;
  let newCost = currentCost;

  if (params.metric === "price") {
    // Price change affects revenue directly, assume slight volume drop if price increases (elasticity)
    const elasticity = 0.5;
    const volumeChange = -(params.change * elasticity);
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
      revenue: ((newRevenue - currentRevenue) / currentRevenue) * 100,
      profit: ((newProfit - currentProfit) / currentProfit) * 100,
    },
  };
}

// Helper: simple linear regression predictor for time-series monthly totals
function predictNextMonthFromMonthlyTotals(monthlyTotals: { total: number }[]) {
  const vals = monthlyTotals.map((m) => m.total || 0);
  const n = vals.length;
  if (n === 0) return { predicted: 0, slope: 0, intercept: 0 };

  const xs = vals.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = vals.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * vals[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  let slope = 0;
  if (denom !== 0) slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const predicted = intercept + slope * n; // next index

  // compute avg growth percent (based on last value)
  const last = vals[n - 1] || 0;
  const prev = vals[n - 2] || 0;
  const monthOverMonth = prev > 0 ? (last - prev) / prev : 0;

  return {
    predicted: Math.max(0, predicted),
    slope,
    intercept,
    monthOverMonth,
  };
}

function formatCurrency(num: number) {
  return (
    "$" +
    Number(num || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );
}

async function fetchDataBasedOnIntent(intent: QueryIntent, tenantId: string): Promise<any> {
  try {
    await connectDB();

    switch (intent.category) {
      case "finance":
        return await fetchAdminFinanceData(tenantId);
      case "sales":
        return await fetchAdminSalesData(tenantId);
      case "inventory":
        return await fetchAdminInventoryData(tenantId);
      case "manufacturing":
        return await fetchAdminManufacturingData(tenantId);
      case "users":
        return await fetchAdminUsersData(tenantId);
      default:
        return await fetchAdminGeneralData(tenantId);
    }
  } catch (error) {
    console.error("Data fetch error:", error);
    return { error: "Failed to fetch data" };
  }
}

async function generateResponseWithGemini(
  message: string,
  data: any,
  intent: QueryIntent,
  simulationResult: any
): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "") {
    return generateSimpleResponse(data, intent);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // Create a rich context prompt with the data and question
    const contextPrompt = `You are an expert business intelligence assistant for an ERP system.

USER'S QUESTION: "${message}"

DATA CATEGORY: ${intent.category}
ACTION TYPE: ${intent.action}

RETRIEVED DATA:
${JSON.stringify(data, null, 2)}

${
  simulationResult
    ? `FINANCIAL SIMULATION RESULT:
${JSON.stringify(simulationResult, null, 2)}
`
    : ""
}

INSTRUCTIONS:
1. Analyze the user's question carefully.
2. Use the provided data to answer accurately.
3. If a financial simulation was run, explain the results clearly (e.g., "If you increase price by 10%, revenue might increase by X% but profit...").
4. Format numbers as currency where appropriate.
5. Provide actionable insights.
6. Be conversational and professional.
7. Highlight key findings with bullet points.
8. Keep the response concise but comprehensive.

Please provide a detailed, intelligent response.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: contextPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("Gemini API error:", response.status, response.statusText);
      return generateSimpleResponse(data, intent);
    }

    const result = await response.json();
    const geminiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (geminiResponse) {
      return geminiResponse;
    }

    return generateSimpleResponse(data, intent);
  } catch (error) {
    console.error("Gemini API error:", error);
    return generateSimpleResponse(data, intent);
  }
}

function generateSimpleResponse(data: any, intent: QueryIntent): string {
  if (data.error) {
    return "I encountered an error while fetching the data. Please try again.";
  }

  if (intent.category === "finance") {
    return `Finance summary — concise and actionable:\n\n• Total Revenue: ${formatCurrency(
      data.summary?.totalRevenue
    )}\n• Total Transactions: ${
      data.summary?.totalTransactions || 0
    }\n• Recent Invoices: ${data.summary?.recentInvoices || 0}`;
  }

  if (intent.category === "sales") {
    const wantsPrediction = intent.action === "predict";

    let response = `Sales overview — short analysis:\n\n• Total Orders (sample): ${
      data.summary?.totalOrders || 0
    }\n• Total Revenue (sample): ${formatCurrency(
      data.summary?.totalRevenue
    )}\n• Average Order Value: ${formatCurrency(
      data.summary?.averageOrderValue || 0
    )}\n`;

    if (data.topProducts?.length > 0) {
      response += `\nTop products:\n`;
      response += data.topProducts
        .map((p: any) => `• ${p.name}: ${p.count} units`)
        .join("\n");
      response += "\n";
    }

    if (wantsPrediction && data.monthlyTotals?.length > 0) {
      const monthly = data.monthlyTotals as { label: string; total: number }[];
      const { predicted, slope, monthOverMonth } =
        predictNextMonthFromMonthlyTotals(monthly);
      const last = monthly[monthly.length - 1]?.total || 0;
      const changePct = last > 0 ? ((predicted - last) / last) * 100 : 0;

      response += `\nPrediction for next month:\n• Predicted Sales: ${formatCurrency(
        predicted
      )}\n`;
      response += `• Last month: ${formatCurrency(last)} (${(
        monthOverMonth * 100
      ).toFixed(1)}% MoM)\n`;
      response += `• Expected change vs last month: ${changePct.toFixed(1)}%\n`;

      const confidence =
        Math.abs(slope) < Math.max(1, last * 0.1)
          ? "moderate"
          : "low-to-moderate";
      response += `\nInterpretation: Based on the last ${
        monthly.length
      } months, the model projects ${formatCurrency(
        predicted
      )} for next month. Confidence: ${confidence}.`;
    }

    return response;
  }

  if (intent.category === "inventory") {
    return `Inventory snapshot:\n\n• Total Items: ${
      data.summary?.totalItems || 0
    }\n• Low Stock Items: ${
      data.summary?.lowStockCount || 0
    }\n• Out of Stock: ${
      data.summary?.outOfStockCount || 0
    }\n• Total Inventory Value: ${formatCurrency(data.summary?.totalValue)}`;
  }

  if (intent.category === "manufacturing") {
    let resp = `Manufacturing snapshot:\n\n• Total Shipments: ${
      data.summary?.totalShipments || 0
    }\n`;
    if (data.summary?.statusBreakdown) {
      resp += "\nStatus breakdown:\n";
      resp += Object.entries(data.summary.statusBreakdown)
        .map(([status, count]) => `• ${status}: ${count}`)
        .join("\n");
    }
    return resp;
  }

  if (intent.category === "users") {
    let resp = `User statistics:\n\n• Total Users: ${
      data.summary?.totalUsers || 0
    }\n`;
    if (data.summary?.roleBreakdown) {
      resp += "\nBy role:\n";
      resp += Object.entries(data.summary.roleBreakdown)
        .map(([role, count]) => `• ${role}: ${count}`)
        .join("\n");
    }
    return resp;
  }

  return `I am currently operating in basic mode without an active LLM key.

To test my UI, you can ask me specific questions about:
• Finance
• Sales
• Inventory
• Manufacturing
• Users

Once my backend is fully activated with a valid API key, I will be able to perform deep, conversational analysis of your ERP data.`;
}
