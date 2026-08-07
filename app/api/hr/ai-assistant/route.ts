import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { randomUUID } from "crypto";
import Employee from "@/models/Employee";
import Payroll from "@/models/Payroll";
import Attendance from "@/models/Attendance";
import LeaveRequest from "@/models/LeaveRequest";
import Department from "@/models/Department";
import { type ChatTurn } from "@/lib/ai/claude";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { safeContextJson } from "@/lib/ai/sanitizeContext";
import ChatHistory from "@/models/ChatHistory";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== "hr") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationId: incomingConversationId } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    await connectDB();

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

    const data = await fetchHRData(tenantId);
    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const genResult = await generateResponse(message, data, priorTurns, tenantId, tier, aiSettings);
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
          module: "hr",
          title: message.slice(0, 80),
        },
        $push: {
          messages: {
            $each: [
              { role: "user", content: message, timestamp: now },
              { role: "assistant", content: response, timestamp: new Date(now.getTime() + 1) },
            ],
          },
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ response, conversationId });
  } catch (error) {
    console.error("HR AI Error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

async function fetchHRData(tenantId: string) {
  const [employees, departments, pendingLeaves, recentPayroll] =
    await Promise.all([
      Employee.find({ tenantId }).lean(),
      Department.find({ tenantId }).lean(),
      LeaveRequest.find({ tenantId, status: "pending" }).lean(),
      Payroll.find({ tenantId }).sort({ createdAt: -1 }).limit(3).lean(),
    ]);

  const activeEmployees = employees.filter(
    (e) => e.lifecycleStatus === "active",
  );

  const totalSalaryBill = activeEmployees.reduce(
    (sum, e: any) => sum + (e.salary?.grossSalary || 0),
    0,
  );

  return {
    summary: {
      totalEmployees: employees.length,
      activeEmployees: activeEmployees.length,
      departments: departments.length,
      pendingLeaves: pendingLeaves.length,
      totalMonthlySalaryBill: totalSalaryBill,
    },
    recentPayroll: recentPayroll.map((p: any) => ({
      code: p.payrollCode,
      period: `${p.payrollPeriod?.month}/${p.payrollPeriod?.year}`,
      status: p.status,
      totalNet: p.totals?.totalNet || 0,
    })),
    lifecycleBreakdown: employees.reduce(
      (acc: Record<string, number>, e: any) => {
        acc[e.lifecycleStatus] = (acc[e.lifecycleStatus] || 0) + 1;
        return acc;
      },
      {},
    ),
  };
}

type GenerateResult =
  | { gated: false; text: string }
  | { gated: true; error: string; code: string; currentTier?: string; requiredAction?: string };

async function generateResponse(
  message: string,
  data: any,
  priorTurns: ChatTurn[],
  tenantId: string,
  tier: string,
  aiSettings: Parameters<typeof callClaudeForTenant>[2]
): Promise<GenerateResult> {
  const prompt = `You are an expert HR AI assistant for an ERP system.

User Question: "${message}"

Available HR Data:
${safeContextJson(data, { maxArray: 6 })}

Instructions:
1. Answer using the provided data only. Do not invent numbers.
2. Format salary values with ₹ (Indian ERP).
3. Use bullet points for clarity. Be concise but complete.
4. If data is missing or insufficient, say so clearly.`;

  const opts = {
    systemPrompt: "You are a precise HR analytics assistant. For DATA questions use only the figures given (never invent numbers); for HOW-TO questions give clear step-by-step app guidance and do NOT reference raw data. NEVER print internal database IDs (partner/customer/order IDs) or raw JSON — refer to things by their human name/number. Reply organised and concise.",
    maxTokens: 1024,
  };

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      ...opts,
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
    return { gated: false, text: generateSimpleResponse(message, data) };
  }
}

function generateSimpleResponse(message: string, data: any): string {
  const lower = message.toLowerCase();

  if (lower.includes("payroll") || lower.includes("salary")) {
    let response = `Payroll Summary:\n\n• Monthly Salary Bill: ₹${(data.summary.totalMonthlySalaryBill || 0).toLocaleString()}\n• Active Employees: ${data.summary.activeEmployees}`;
    if (data.recentPayroll.length > 0) {
      response += `\n\nRecent Payrolls:\n${data.recentPayroll
        .map((p: any) => `• ${p.code} (${p.period}) — Status: ${p.status}, Net: ₹${(p.totalNet || 0).toLocaleString()}`)
        .join("\n")}`;
    }
    return response;
  }

  if (lower.includes("leave") || lower.includes("absence")) {
    return `Leave Management:\n\n• Pending Leave Requests: ${data.summary.pendingLeaves}\n• Active Employees: ${data.summary.activeEmployees}`;
  }

  if (lower.includes("department")) {
    return `Department Overview:\n\n• Total Departments: ${data.summary.departments}\n• Active Employees: ${data.summary.activeEmployees}`;
  }

  let response = `HR Overview:\n\n• Total Employees: ${data.summary.totalEmployees}\n• Active Employees: ${data.summary.activeEmployees}\n• Departments: ${data.summary.departments}\n• Pending Leave Requests: ${data.summary.pendingLeaves}\n• Monthly Salary Bill: ₹${(data.summary.totalMonthlySalaryBill || 0).toLocaleString()}`;

  if (data.lifecycleBreakdown) {
    response += `\n\nEmployee Lifecycle:\n${Object.entries(data.lifecycleBreakdown)
      .map(([status, count]) => `• ${status}: ${count}`)
      .join("\n")}`;
  }

  return response;
}
