import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import { randomUUID } from 'crypto';
import InventoryItem from '@/models/InventoryItem';
import Batch from '@/models/Batch';
import { type ChatTurn } from '@/lib/ai/claude';
import { resolveTenantAiSettings, callClaudeForTenant } from '@/lib/ai/tenantAi';
import { safeContextJson } from '@/lib/ai/sanitizeContext';
import { AI_ASSISTANT_GUIDANCE } from '@/lib/ai/assistantGuidance';
import ChatHistory from '@/models/ChatHistory';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== 'inventory') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationId: incomingConversationId } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
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

    const data = await fetchInventoryData(tenantId);
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
          module: 'inventory',
          title: message.slice(0, 80),
        },
        $push: {
          messages: {
            $each: [
              { role: 'user', content: message, timestamp: now },
              { role: 'assistant', content: response, timestamp: new Date(now.getTime() + 1) },
            ],
          },
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ response, conversationId });
  } catch (error) {
    console.error('Inventory AI Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

async function fetchInventoryData(tenantId: string) {
  const items = await (InventoryItem as any).find({ tenantId }).lean();

  const totalItems = items.length;
  const lowStockItems = items.filter(
    (item: any) => item.quantity <= (item.reorderPoint || 10)
  );
  const outOfStock = items.filter((item: any) => item.quantity === 0);

  const totalValue = items.reduce(
    (sum: number, item: any) =>
      sum + (item.quantity || 0) * (item.unitPrice || 0),
    0
  );

  return {
    summary: {
      totalItems,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStock.length,
      totalValue,
    },
    lowStockItems: lowStockItems.slice(0, 10),
    recentItems: items.slice(0, 5),
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
  const prompt = `You are an expert inventory AI assistant for an ERP system.

User Question: "${message}"

Available Inventory Data:
${safeContextJson(data, { maxArray: 6 })}

Instructions:
1. Answer using the provided data only. Do not invent numbers.
2. Format currency values with ₹ (Indian ERP).
3. Highlight low stock and out-of-stock items proactively.
4. Use bullet points for clarity. Be concise but complete.
5. If data is missing or insufficient, say so clearly.`;

  const opts = {
    systemPrompt: "You are a precise inventory analytics assistant. For DATA questions use only the figures given (never invent numbers); for HOW-TO questions give clear step-by-step app guidance and do NOT reference raw data. NEVER print internal database IDs (partner/customer/order IDs) or raw JSON — refer to things by their human name/number. Reply organised and concise." + AI_ASSISTANT_GUIDANCE,
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
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes('low stock') ||
    lowerMessage.includes('reorder') ||
    lowerMessage.includes('alert')
  ) {
    let response = `Low Stock Alert:\n\n• Items Low in Stock: ${data.summary.lowStockCount}\n• Out of Stock: ${data.summary.outOfStockCount}`;

    if (data.lowStockItems?.length > 0) {
      response += `\n\nItems Needing Attention:\n${data.lowStockItems
        .slice(0, 5)
        .map((item: any) => `• ${item.name || item.sku || 'Unknown'}: ${item.quantity || 0} units`)
        .join('\n')}`;
    }

    return response;
  }

  return (
    `Inventory Overview:\n\n` +
    `• Total Items: ${data.summary.totalItems}\n` +
    `• Low Stock Items: ${data.summary.lowStockCount}\n` +
    `• Out of Stock: ${data.summary.outOfStockCount}\n` +
    `• Total Inventory Value: ${formatCurrency(data.summary.totalValue)}`
  );
}

function formatCurrency(num: number) {
  return '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
