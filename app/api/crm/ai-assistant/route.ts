import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { randomUUID } from "crypto";
import CrmLead from "@/models/crm/Lead";
import CrmAccount from "@/models/crm/Account";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmCase from "@/models/crm/Case";
import CrmCampaign from "@/models/crm/Campaign";
import CrmTask from "@/models/crm/Task";
import CrmActivity from "@/models/crm/Activity";
import { type ChatTurn } from "@/lib/ai/claude";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { safeContextJson } from "@/lib/ai/sanitizeContext";
import { AI_ASSISTANT_GUIDANCE } from '@/lib/ai/assistantGuidance';
import { processChatAttachments, attachmentsPromptBlock } from '@/lib/ai/chatAttachments';
import ChatHistory from "@/models/ChatHistory";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId: incomingConversationId } = body;
    const message: string = body.message ?? body.query ?? "";
    const { imageDataUrls, docTexts } = await processChatAttachments(body);

    if (!message && imageDataUrls.length === 0 && docTexts.length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    await connectDB();

    const conversationId: string = incomingConversationId || randomUUID();
    const userId = (session.user as any).id as string;

    const existingHistory = await ChatHistory.findOne(
      { tenantId, conversationId },
      { messages: 1 }
    ).lean();
    const priorTurns: ChatTurn[] = (existingHistory?.messages ?? []).map(
      (m: any) => ({ role: m.role, content: m.content })
    );

    const data = await fetchCRMData(tenantId);
    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const genResult = await generateResponse(message, data, priorTurns, tenantId, tier, aiSettings, imageDataUrls, docTexts);
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

    const now = new Date();
    await ChatHistory.findOneAndUpdate(
      { tenantId, conversationId },
      {
        $setOnInsert: {
          tenantId,
          conversationId,
          userId,
          module: "crm",
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
    console.error("CRM AI Error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

async function fetchCRMData(tenantId: string) {
  const [leads, accounts, opportunities, cases, campaigns, openTasks, recentActivities] =
    await Promise.all([
      CrmLead.find({ tenantId }).lean(),
      CrmAccount.countDocuments({ tenantId }),
      CrmOpportunity.find({ tenantId }).lean(),
      CrmCase.find({ tenantId }).lean(),
      CrmCampaign.find({ tenantId }).lean(),
      CrmTask.find({ tenantId, status: { $in: ["Pending", "In Progress", "Overdue"] } }).lean(),
      CrmActivity.find({ tenantId }).sort({ activity_date: -1 }).limit(10).lean(),
    ]);

  const openOpportunities = opportunities.filter((o: any) => !["Closed Won", "Closed Lost"].includes(o.stage));
  const pipelineValue = openOpportunities.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
  const wonValue = opportunities
    .filter((o: any) => o.stage === "Closed Won")
    .reduce((sum: number, o: any) => sum + (o.amount || 0), 0);

  return {
    summary: {
      totalLeads: leads.length,
      totalAccounts: accounts,
      openOpportunities: openOpportunities.length,
      pipelineValue,
      wonValue,
      openCases: cases.filter((c: any) => !["Resolved", "Closed"].includes(c.status)).length,
      activeCampaigns: campaigns.filter((c: any) => c.status === "Active").length,
      openTasks: openTasks.length,
      overdueTasks: openTasks.filter((t: any) => t.status === "Overdue").length,
    },
    leadsByStatus: leads.reduce((acc: Record<string, number>, l: any) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {}),
    opportunitiesByStage: opportunities.reduce((acc: Record<string, number>, o: any) => {
      acc[o.stage] = (acc[o.stage] || 0) + 1;
      return acc;
    }, {}),
    casesBySeverity: cases.reduce((acc: Record<string, number>, c: any) => {
      acc[c.severity] = (acc[c.severity] || 0) + 1;
      return acc;
    }, {}),
    campaigns: campaigns.slice(0, 8).map((c: any) => ({
      name: c.campaign_name,
      status: c.status,
      budget: c.budget,
      revenue: c.attributed_revenue,
      roi: c.roi_percentage,
    })),
    recentActivities: recentActivities.map((a: any) => ({
      type: a.type,
      subject: a.subject,
      date: a.activity_date,
    })),
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
  aiSettings: Parameters<typeof callClaudeForTenant>[2],
  imageDataUrls: string[] = [],
  docTexts: string[] = []
): Promise<GenerateResult> {
  const prompt = `You are an expert CRM AI assistant for an ERP system.

User Question: "${message || "Please read the attached file(s) and help accordingly."}"

Available CRM Data:
${safeContextJson(data, { maxArray: 8 })}${attachmentsPromptBlock(imageDataUrls, docTexts)}

Instructions:
1. Answer using the provided data only. Do not invent numbers.
2. Format monetary values with ₹ (Indian ERP).
3. Use bullet points for clarity. Be concise but complete.
4. If data is missing or insufficient, say so clearly.`;

  const opts = {
    systemPrompt: "You are a precise CRM analytics assistant covering leads, accounts, opportunities/pipeline, cases, campaigns, tasks and activities. For DATA questions use only the figures given (never invent numbers); for HOW-TO questions give clear step-by-step app guidance and do NOT reference raw data. NEVER print internal database IDs or raw JSON — refer to things by their human name/number. Reply organised and concise." + AI_ASSISTANT_GUIDANCE,
    maxTokens: 1024,
    imageDataUrls: imageDataUrls.length ? imageDataUrls : undefined,
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

  if (lower.includes("pipeline") || lower.includes("opportunit") || lower.includes("deal")) {
    return `Pipeline Summary:\n\n• Open Opportunities: ${data.summary.openOpportunities}\n• Pipeline Value: ₹${(data.summary.pipelineValue || 0).toLocaleString()}\n• Won Value: ₹${(data.summary.wonValue || 0).toLocaleString()}`;
  }

  if (lower.includes("case")) {
    return `Cases Summary:\n\n• Open Cases: ${data.summary.openCases}`;
  }

  if (lower.includes("campaign")) {
    return `Campaigns Summary:\n\n• Active Campaigns: ${data.summary.activeCampaigns}`;
  }

  if (lower.includes("task")) {
    return `Tasks Summary:\n\n• Open Tasks: ${data.summary.openTasks}\n• Overdue: ${data.summary.overdueTasks}`;
  }

  return `CRM Overview:\n\n• Total Leads: ${data.summary.totalLeads}\n• Total Accounts: ${data.summary.totalAccounts}\n• Open Opportunities: ${data.summary.openOpportunities} (₹${(data.summary.pipelineValue || 0).toLocaleString()})\n• Open Cases: ${data.summary.openCases}\n• Active Campaigns: ${data.summary.activeCampaigns}\n• Open Tasks: ${data.summary.openTasks}`;
}
