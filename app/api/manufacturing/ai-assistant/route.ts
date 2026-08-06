import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Shipment from '@/models/Shipment';
import AirFreight from '@/models/AirFreight';
import HSCode from '@/models/HSCode';
import { resolveTenantAiSettings, callClaudeForTenant } from '@/lib/ai/tenantAi';

interface TaskIntent {
  intent: string;
  entity: string;
  action: string;
  confidence: number;
  data?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== 'manufacturing') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { message, confirmAction, actionData, currentTask, cancelAction } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    await connectDB();
    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);

    // Handle action cancellation
    if (cancelAction) {
      return NextResponse.json({ 
        response: "Action cancelled. How else can I help you with manufacturing tasks?",
        success: false,
        cancelled: true
      });
    }

    // Handle action confirmation
    if (confirmAction && actionData) {
      return await executeAction(actionData, tenantId);
    }

    // Check if this is a continuation of a previous task
    if (currentTask && currentTask.intent !== 'none') {
      const requirements = getTaskRequirements(currentTask.intent);
      const missingFields = requirements.fields.filter(field => !currentTask.providedData[field]);
      
      // Use combined analysis to get both intent confirmation and data extraction
      const { intent: confirmedIntent, extractedData, gated } = await analyzeIntentAndExtractData(
        message, tenantId, tier, aiSettings, missingFields
      );
      if (gated) {
        return NextResponse.json(
          { error: gated.error, code: gated.code, currentTier: gated.currentTier, requiredAction: gated.requiredAction },
          { status: 403 }
        );
      }

      // If user is trying to do something different, handle as new task
      if (confirmedIntent.intent !== currentTask.intent && confirmedIntent.intent !== 'none') {
        // User changed their mind - treat as new task
        const taskAnalysis = confirmedIntent;
        const requirements = getTaskRequirements(taskAnalysis.intent);
        const providedData = taskAnalysis.data || {};
        const missingFields = requirements.fields.filter(field => !providedData[field]);

        if (missingFields.length > 0) {
          const response = generateMissingFieldsResponse(taskAnalysis.intent, providedData, missingFields, requirements);
          return NextResponse.json({ 
            response, 
            requiresConfirmation: false,
            missingFields,
            taskIntent: taskAnalysis.intent,
            providedData
          });
        }

        const confirmationResponse = generateConfirmationResponse(taskAnalysis.intent, providedData, requirements);
        return NextResponse.json({ 
          response: confirmationResponse,
          requiresConfirmation: true,
          taskIntent: taskAnalysis.intent,
          providedData,
          pendingAction: {
            intent: taskAnalysis.intent,
            data: providedData,
            endpoint: requirements.endpoint,
            method: requirements.method
          }
        });
      }

      // Continue with current task
      const newData = extractedData || {};
      const mergedData = { ...currentTask.providedData, ...newData };
      const stillMissingFields = requirements.fields.filter(field => !mergedData[field]);

      if (stillMissingFields.length > 0) {
        // Still missing fields - ask again
        const response = generateMissingFieldsResponse(currentTask.intent, mergedData, stillMissingFields, requirements);
        return NextResponse.json({ 
          response, 
          requiresConfirmation: false,
          missingFields: stillMissingFields,
          taskIntent: currentTask.intent,
          providedData: mergedData
        });
      }

      // All required fields now provided - show confirmation
      const confirmationResponse = generateConfirmationResponse(currentTask.intent, mergedData, requirements);
      return NextResponse.json({ 
        response: confirmationResponse,
        requiresConfirmation: true,
        taskIntent: currentTask.intent,
        providedData: mergedData,
        pendingAction: {
          intent: currentTask.intent,
          data: mergedData,
          endpoint: requirements.endpoint,
          method: requirements.method
        }
      });
    }

    // Analyze the message for task creation intent
    const { intent: taskAnalysis, gated: taskGated } = await analyzeIntentAndExtractData(
      message, tenantId, tier, aiSettings
    );
    if (taskGated) {
      return NextResponse.json(
        { error: taskGated.error, code: taskGated.code, currentTier: taskGated.currentTier, requiredAction: taskGated.requiredAction },
        { status: 403 }
      );
    }

    if (taskAnalysis.intent === 'none') {
      // Regular conversation - provide manufacturing data
      const data = await fetchManufacturingData(tenantId);
      const response = await generateResponse(message, data);
      return NextResponse.json({ response });
    }

    // Task creation detected - analyze requirements
    const requirements = getTaskRequirements(taskAnalysis.intent);
    const providedData = taskAnalysis.data || extractDataFromMessage(message, requirements.fields);
    const missingFields = requirements.fields.filter(field => !providedData[field]);

    if (missingFields.length > 0) {
      // Ask for missing information
      const response = generateMissingFieldsResponse(taskAnalysis.intent, providedData, missingFields, requirements);
      return NextResponse.json({ 
        response, 
        requiresConfirmation: false,
        missingFields,
        taskIntent: taskAnalysis.intent,
        providedData
      });
    }

    // All required fields provided - show confirmation
    const confirmationResponse = generateConfirmationResponse(taskAnalysis.intent, providedData, requirements);
    return NextResponse.json({ 
      response: confirmationResponse,
      requiresConfirmation: true,
      taskIntent: taskAnalysis.intent,
      providedData,
      pendingAction: {
        intent: taskAnalysis.intent,
        data: providedData,
        endpoint: requirements.endpoint,
        method: requirements.method
      }
    });

  } catch (error) {
    console.error('Manufacturing AI Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

async function fetchManufacturingData(tenantId: string) {
  const shipments = await (Shipment as any)
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const totalShipments = shipments.length;
  const statusCounts: { [key: string]: number } = {};

  shipments.forEach((shipment: any) => {
    const status = shipment.status || 'Unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  return {
    summary: {
      totalShipments,
      statusBreakdown: statusCounts,
    },
    recentShipments: shipments.slice(0, 5),
  };
}

async function generateResponse(message: string, data: any): Promise<string> {
  let response = `Manufacturing Overview:\n\n• Total Shipments: ${data.summary.totalShipments}`;

  if (data.summary.statusBreakdown) {
    response += '\n\nStatus Breakdown:\n';
    response += Object.entries(data.summary.statusBreakdown)
      .map(([status, count]) => `• ${status}: ${count}`)
      .join('\n');
  }

  return response;
}

// Task Analysis Functions
interface GatedError {
  error: string;
  code: string;
  currentTier?: string;
  requiredAction?: string;
}

async function analyzeIntentAndExtractData(
  message: string,
  tenantId: string,
  tier: string,
  aiSettings: Parameters<typeof callClaudeForTenant>[2],
  missingFields?: string[]
): Promise<{ intent: TaskIntent; extractedData?: Record<string, any>; gated?: GatedError }> {
  let prompt = `Analyze this manufacturing task request and determine what action to perform. Reply ONLY with a JSON object in this exact format:
{
  "intent": "create_hs_code|update_hs_code|delete_hs_code|create_air_freight|update_air_freight|delete_air_freight|create_shipment|update_shipment|delete_shipment|none",
  "entity": "hs_code|air_freight|shipment",
  "action": "create|update|delete",
  "confidence": 0.0-1.0,
  "data": {}
}

Available entities and their fields:
- hs_code: hsCode (string), description (string), category (string), dutyRate (number), taxRate (number)
- air_freight: flightNumber (string), airline (string), origin (string), destination (string), departureTime (string), arrivalTime (string), cargo (string)
- shipment: shipmentNumber (string), customerName (string), origin (string), destination (string), freightProvider (string), shipmentType (string), weight (number), volume (number), items (array), totalValue (number), currency (string)

For update/delete operations, extract the record ID from patterns like:
- "update SHP-982374 with status cancelled" (ID: SHP-982374)
- "delete hs code ABC123" (ID: ABC123)
- "change shipment XYZ-001 status to delivered" (ID: XYZ-001)

Extract any data values mentioned in the message and put them in the "data" object, including the ID for updates/deletes.`;

  if (missingFields && missingFields.length > 0) {
    prompt += `

Additionally, extract the following missing fields from the user's response: ${missingFields.join(', ')}

Field descriptions and expected formats:
- shipmentNumber: string like "SHP-123" or "SHIP-456"
- customerName: string, name of the customer
- origin: string, origin location/city/country
- destination: string, destination location/city/country
- freightProvider: string, name of freight provider
- shipmentType: "air", "sea", "road", or "rail"
- weight: number, weight value (e.g., 10.3)
- volume: number, volume value (e.g., 2.3)
- totalValue: number, monetary value (e.g., 5000)
- currency: 3-letter currency code like "USD", "EUR", "GBP"
- items: array of objects with description, quantity, weight, value, hsCode
- id: string, record identifier like "SHP-982374" or "ABC123"
- status: "cancelled", "pending", "in_transit", "delivered", "completed", "active", "inactive"
- hsCode: string, HS code like "1234.56.78"
- description: string, description text
- category: string, category name
- dutyRate: number, duty rate percentage
- taxRate: number, tax rate percentage
- flightNumber: string, flight number like "AA123" or "BA456"
- airline: string, airline name
- departureTime: string, departure time/date
- arrivalTime: string, arrival time/date
- cargo: string, cargo description

For items field, parse natural language descriptions like:
- "10 water cooler and 20 bottles" → [{"description": "water cooler", "quantity": 10}, {"description": "bottles", "quantity": 20}]
- "5 laptops (SKU: LT-001) and 3 monitors (SKU: MN-002)" → [{"description": "laptops", "quantity": 5, "hsCode": "LT-001"}, {"description": "monitors", "quantity": 3, "hsCode": "MN-002"}]

Include the extracted missing fields in the "data" object as well.`;
  }

  prompt += `

Query: "${message}"`;

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt: 'You are a manufacturing ERP task classifier. Reply only with the JSON object — no explanation, no markdown.',
      maxTokens: 512,
    });
    if (!("text" in result)) {
      return {
        intent: { intent: 'none', entity: '', action: '', confidence: 0 },
        gated: {
          error: result.error,
          code: result.code,
          currentTier: result.currentTier,
          requiredAction: result.requiredAction,
        },
      };
    }
    const text = result.text;

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const parsedIntent = {
        intent: parsed.intent || 'none',
        entity: parsed.entity || '',
        action: parsed.action || '',
        confidence: parsed.confidence || 0,
        data: parsed.data || {}
      };

      // Fall back to simple analysis when model is unsure
      if (!parsedIntent.intent || parsedIntent.intent === 'none' || (parsedIntent.confidence && parsedIntent.confidence < 0.6)) {
        const intent = simpleTaskAnalysis(message);
        const extractedData = missingFields ? extractDataFromMessage(message, missingFields) : undefined;
        return { intent, extractedData };
      }

      // Extract the missing fields data if provided
      let extractedData: Record<string, any> | undefined;
      if (missingFields && parsedIntent.data) {
        extractedData = {};
        for (const field of missingFields) {
          if (parsedIntent.data[field] !== undefined) {
            extractedData[field] = parsedIntent.data[field];
          }
        }
      }

      return { intent: parsedIntent, extractedData };
    }

    const intent = simpleTaskAnalysis(message);
    const extractedData = missingFields ? extractDataFromMessage(message, missingFields) : undefined;
    return { intent, extractedData };
  } catch {
    const intent = simpleTaskAnalysis(message);
    const extractedData = missingFields ? extractDataFromMessage(message, missingFields) : undefined;
    return { intent, extractedData };
  }
}

function simpleTaskAnalysis(message: string): TaskIntent {
  const lowerMessage = message.toLowerCase();

  // Create operations
  if (lowerMessage.includes('create')) {
    if (lowerMessage.includes('hs code') || lowerMessage.includes('hs-code')) {
      return { intent: 'create_hs_code', entity: 'hs_code', action: 'create', confidence: 0.8 };
    }
    if (lowerMessage.includes('air freight') || lowerMessage.includes('flight')) {
      return { intent: 'create_air_freight', entity: 'air_freight', action: 'create', confidence: 0.8 };
    }
    if (lowerMessage.includes('shipment') || lowerMessage.includes('ship')) {
      return { intent: 'create_shipment', entity: 'shipment', action: 'create', confidence: 0.8 };
    }
  }

  // Update operations
  if (lowerMessage.includes('update') || lowerMessage.includes('change') || lowerMessage.includes('modify')) {
    if (lowerMessage.includes('hs code') || lowerMessage.includes('hs-code')) {
      return { intent: 'update_hs_code', entity: 'hs_code', action: 'update', confidence: 0.8 };
    }
    if (lowerMessage.includes('air freight') || lowerMessage.includes('flight')) {
      return { intent: 'update_air_freight', entity: 'air_freight', action: 'update', confidence: 0.8 };
    }
    if (lowerMessage.includes('shipment') || lowerMessage.includes('ship') || lowerMessage.match(/update\s+[A-Z]{3}-/) || lowerMessage.match(/SHP-/)) {
      return { intent: 'update_shipment', entity: 'shipment', action: 'update', confidence: 0.8 };
    }
  }

  // Delete operations
  if (lowerMessage.includes('delete') || lowerMessage.includes('remove')) {
    if (lowerMessage.includes('hs code') || lowerMessage.includes('hs-code')) {
      return { intent: 'delete_hs_code', entity: 'hs_code', action: 'delete', confidence: 0.8 };
    }
    if (lowerMessage.includes('air freight') || lowerMessage.includes('flight')) {
      return { intent: 'delete_air_freight', entity: 'air_freight', action: 'delete', confidence: 0.8 };
    }
    if (lowerMessage.includes('shipment') || lowerMessage.includes('ship')) {
      return { intent: 'delete_shipment', entity: 'shipment', action: 'delete', confidence: 0.8 };
    }
  }

  return { intent: 'none', entity: '', action: '', confidence: 0 };
}

function getTaskRequirements(intent: string) {
  switch (intent) {
    case 'create_hs_code':
      return {
        endpoint: '/api/manufacturing/hs-codes',
        method: 'POST',
        fields: ['hsCode', 'description', 'category', 'dutyRate', 'taxRate'],
        optionalFields: ['restrictions', 'requiredDocuments', 'notes'],
        description: 'Create a new HS Code for customs classification'
      };

    case 'update_hs_code':
      return {
        endpoint: '/api/manufacturing/hs-codes',
        method: 'PUT',
        fields: ['id'], // ID is required for updates
        optionalFields: ['hsCode', 'description', 'category', 'dutyRate', 'taxRate', 'restrictions', 'requiredDocuments', 'notes'],
        description: 'Update an existing HS Code'
      };

    case 'delete_hs_code':
      return {
        endpoint: '/api/manufacturing/hs-codes',
        method: 'DELETE',
        fields: ['id'],
        optionalFields: [],
        description: 'Delete an HS Code'
      };

    case 'create_air_freight':
      return {
        endpoint: '/api/manufacturing/air-freight',
        method: 'POST',
        fields: ['flightNumber', 'airline', 'origin', 'destination', 'departureTime', 'arrivalTime', 'cargo'],
        optionalFields: ['cargoUnit', 'aircraftType', 'notes'],
        description: 'Create a new air freight flight record'
      };

    case 'update_air_freight':
      return {
        endpoint: '/api/manufacturing/air-freight',
        method: 'PUT',
        fields: ['id'],
        optionalFields: ['flightNumber', 'airline', 'origin', 'destination', 'departureTime', 'arrivalTime', 'cargo', 'cargoUnit', 'aircraftType', 'notes'],
        description: 'Update an existing air freight record'
      };

    case 'delete_air_freight':
      return {
        endpoint: '/api/manufacturing/air-freight',
        method: 'DELETE',
        fields: ['id'],
        optionalFields: [],
        description: 'Delete an air freight record'
      };

    case 'create_shipment':
      return {
        endpoint: '/api/manufacturing/shipments',
        method: 'POST',
        fields: ['shipmentNumber', 'customerName', 'origin', 'destination', 'freightProvider', 'shipmentType', 'weight', 'volume', 'items', 'totalValue', 'currency'],
        optionalFields: ['customerEmail', 'trackingNumber', 'estimatedDelivery', 'notes'],
        description: 'Create a new shipment record'
      };

    case 'update_shipment':
      return {
        endpoint: '/api/manufacturing/shipments',
        method: 'PUT',
        fields: ['id'],
        optionalFields: ['shipmentNumber', 'customerName', 'origin', 'destination', 'freightProvider', 'shipmentType', 'weight', 'volume', 'items', 'totalValue', 'currency', 'customerEmail', 'trackingNumber', 'estimatedDelivery', 'notes', 'status'],
        description: 'Update an existing shipment'
      };

    case 'delete_shipment':
      return {
        endpoint: '/api/manufacturing/shipments',
        method: 'DELETE',
        fields: ['id'],
        optionalFields: [],
        description: 'Delete a shipment'
      };

    default:
      return null;
  }
}

function extractDataFromMessage(message: string, requiredFields: string[]): Record<string, any> {
  const data: Record<string, any> = {};
  const lowerMessage = message.toLowerCase();

  // Extract HS Code data
  if (requiredFields.includes('hsCode')) {
    const hsCodeMatch = message.match(/hs\s*code[:\s]*([A-Z0-9.]+)/i) || message.match(/code[:\s]*([A-Z0-9.]+)/i);
    if (hsCodeMatch) data.hsCode = hsCodeMatch[1];
  }

  if (requiredFields.includes('description')) {
    const descMatch = message.match(/description[:\s]*([^\n\r,]+)/i) || message.match(/desc[:\s]*([^\n\r,]+)/i);
    if (descMatch) data.description = descMatch[1].trim();
  }

  if (requiredFields.includes('category')) {
    const categoryMatch = message.match(/category[:\s]*([^\n\r,]+)/i) || message.match(/cat[:\s]*([^\n\r,]+)/i);
    if (categoryMatch) data.category = categoryMatch[1].trim();
  }

  // Extract numeric values
  if (requiredFields.includes('dutyRate')) {
    const dutyMatch = message.match(/duty\s*rate[:\s]*(\d+(?:\.\d+)?)/i) || message.match(/duty[:\s]*(\d+(?:\.\d+)?)/i);
    if (dutyMatch) data.dutyRate = parseFloat(dutyMatch[1]);
  }

  if (requiredFields.includes('taxRate')) {
    const taxMatch = message.match(/tax\s*rate[:\s]*(\d+(?:\.\d+)?)/i) || message.match(/tax[:\s]*(\d+(?:\.\d+)?)/i);
    if (taxMatch) data.taxRate = parseFloat(taxMatch[1]);
  }

  // Extract flight data
  if (requiredFields.includes('flightNumber')) {
    const flightMatch = message.match(/flight\s*number[:\s]*([A-Z0-9]+)/i) || message.match(/flight[:\s]*([A-Z0-9]+)/i);
    if (flightMatch) data.flightNumber = flightMatch[1];
  }

  if (requiredFields.includes('airline')) {
    const airlineMatch = message.match(/airline[:\s]*([^\n\r,]+)/i);
    if (airlineMatch) data.airline = airlineMatch[1].trim();
  }

  // Extract locations
  if (requiredFields.includes('origin')) {
    const originMatch = message.match(/origin[:\s]*([^\n\r,]+)/i) || message.match(/from[:\s]*([^\n\r,]+)/i);
    if (originMatch) data.origin = originMatch[1].trim();
  }

  if (requiredFields.includes('destination')) {
    const destMatch = message.match(/destination[:\s]*([^\n\r,]+)/i) || message.match(/to[:\s]*([^\n\r,]+)/i);
    if (destMatch) data.destination = destMatch[1].trim();
  }

  // Extract dates
  if (requiredFields.includes('departureTime')) {
    const depMatch = message.match(/departure[:\s]*([^\n\r,]+)/i) || message.match(/dep\s*time[:\s]*([^\n\r,]+)/i);
    if (depMatch) data.departureTime = depMatch[1].trim();
  }

  if (requiredFields.includes('arrivalTime')) {
    const arrMatch = message.match(/arrival[:\s]*([^\n\r,]+)/i) || message.match(/arr\s*time[:\s]*([^\n\r,]+)/i);
    if (arrMatch) data.arrivalTime = arrMatch[1].trim();
  }

  // Extract ID for updates and deletes
  if (requiredFields.includes('id')) {
    // Look for ID patterns in update/delete messages
    const idMatch = message.match(/(?:update|delete|change|modify)\s+(?:hs\s*code|air\s*freight|shipment)?\s*([A-Z0-9\-_.]+)/i) ||
                   message.match(/(?:id|code)[:\s]*([A-Z0-9\-_.]+)/i) ||
                   message.match(/(?:update|delete|change|modify)\s+([A-Z0-9\-_.]+(?:\s+|$))/i);
    if (idMatch) data.id = idMatch[1].trim();
  }

  // Extract status for updates
  if (requiredFields.includes('status')) {
    const statusMatch = message.match(/status[:\s]*(cancelled|pending|in\s*transit|delivered|completed|active|inactive)/i);
    if (statusMatch) data.status = statusMatch[1].toLowerCase().replace(/\s+/g, '_');
  }

  if (requiredFields.includes('customerName')) {
    const customerMatch = message.match(/customer[:\s]*([^\n\r,]+)/i) || message.match(/client[:\s]*([^\n\r,]+)/i);
    if (customerMatch) data.customerName = customerMatch[1].trim();
  }

  if (requiredFields.includes('freightProvider')) {
    const providerMatch = message.match(/freight\s*provider[:\s]*([^\n\r,]+)/i) || message.match(/provider[:\s]*([^\n\r,]+)/i);
    if (providerMatch) data.freightProvider = providerMatch[1].trim();
  }

  if (requiredFields.includes('shipmentType')) {
    const typeMatch = message.match(/shipment\s*type[:\s]*(air|sea|road|rail)/i) || message.match(/type[:\s]*(air|sea|road|rail)/i);
    if (typeMatch) data.shipmentType = typeMatch[1].toLowerCase();
  }

  // Extract numeric values for shipment
  if (requiredFields.includes('weight')) {
    const weightMatch = message.match(/weight[:\s]*(\d+(?:\.\d+)?)/i);
    if (weightMatch) data.weight = parseFloat(weightMatch[1]);
  }

  if (requiredFields.includes('volume')) {
    const volumeMatch = message.match(/volume[:\s]*(\d+(?:\.\d+)?)/i);
    if (volumeMatch) data.volume = parseFloat(volumeMatch[1]);
  }

  if (requiredFields.includes('totalValue')) {
    const valueMatch = message.match(/total\s*value[:\s]*(\d+(?:\.\d+)?)/i) || message.match(/value[:\s]*(\d+(?:\.\d+)?)/i);
    if (valueMatch) data.totalValue = parseFloat(valueMatch[1]);
  }

  if (requiredFields.includes('currency')) {
    const currencyMatch = message.match(/currency[:\s]*([A-Z]{3})/i) || message.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR)\b/i);
    if (currencyMatch) data.currency = currencyMatch[1].toUpperCase();
  }

  if (requiredFields.includes('items')) {
    // Try multiple patterns for items
    let itemsText = '';
    
    // Pattern 1: explicit items field
    const itemsFieldMatch = message.match(/items?[:\s]*([^\n\r]*(?:\n[^\n\r]*)*?)(?=\n\w+[:\s]|$)/i);
    if (itemsFieldMatch) {
      itemsText = itemsFieldMatch[1].trim();
    } else {
      // Pattern 2: look for item-like patterns in the entire message
      const itemPatterns = message.match(/(\d+)\s+[^0-9\s(]+(?:\s+[^0-9\s(]+)*\s*\([^)]*\)/g);
      if (itemPatterns) {
        itemsText = itemPatterns.join(' and ');
      }
    }
    
    if (itemsText) {
      const items: any[] = [];
      
      // Split by "and" or commas to handle multiple items
      const itemParts = itemsText.split(/\s+and\s+|,\s*/i);
      
      for (const part of itemParts) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;
        
        // Match pattern: quantity description (SKU: sku) or quantity description (sku)
        const itemMatch = trimmedPart.match(/^(\d+)\s+(.+?)\s*\((?:SKU:\s*)?([A-Z0-9\-]+)\)$/i);
        if (itemMatch) {
          const [, quantity, description, sku] = itemMatch;
          items.push({
            description: description.trim(),
            quantity: parseInt(quantity),
            weight: 0, // Will need to be calculated or provided separately
            value: 0,  // Will need to be calculated or provided separately
            hsCode: sku
          });
        }
      }
      
      if (items.length > 0) {
        data.items = items;
      }
    }
  }

  return data;
}

function generateMissingFieldsResponse(intent: string, providedData: Record<string, any>, missingFields: string[], requirements: any): string {
  const action = intent.split('_')[0]; // create, update, delete
  const entity = intent.split('_').slice(1).join('_'); // hs_code, air_freight, shipment

  let response = `Sure! You want to ${action} ${entity.replace('_', ' ')}.\n\n`;

  if (action === 'update' || action === 'delete') {
    response += `To ${action} the ${entity.replace('_', ' ')}, I need to identify which record you're referring to.\n\n`;
  } else {
    response += `To ${action} a new ${entity.replace('_', ' ')}, I need a few details:\n\n`;
  }

  response += `Required fields for ${requirements.method} ${requirements.endpoint}:\n\n`;

  missingFields.forEach(field => {
    response += `• ${field}\n`;
  });

  if (Object.keys(providedData).length > 0) {
    response += `\nAlready provided:\n`;
    Object.entries(providedData).forEach(([key, value]) => {
      if (key === 'items' && Array.isArray(value)) {
        response += `• ${key}: ${value.length} items\n`;
      } else {
        response += `• ${key}: ${value}\n`;
      }
    });
  }

  response += `\nPlease provide the missing information.`;
  return response;
}

function generateConfirmationResponse(intent: string, data: Record<string, any>, requirements: any): string {
  let response = `Perfect! All required information is provided.\n\nHere is what I will do:\n\n✅ API Selected:\n${requirements.method} ${requirements.endpoint}\n\n📦 Payload to be sent:\n`;

  // Format items nicely if present
  if (data.items && Array.isArray(data.items)) {
    const formattedData = { ...data };
    
    // For shipment creation, distribute weight and value if not provided
    if (intent === 'create_shipment' && data.items.length > 0) {
      const totalWeight = data.weight || 0;
      const totalValue = data.totalValue || 0;
      
      formattedData.items = data.items.map((item: any, index: number) => ({
        ...item,
        weight: item.weight || (totalWeight / data.items.length),
        value: item.value || (totalValue / data.items.length)
      }));
      
      formattedData.items = formattedData.items.map((item: any, index: number) => 
        `${index + 1}. ${item.quantity}x ${item.description} (SKU: ${item.hsCode})\n   Weight: ${item.weight.toFixed(2)}kg, Value: $${item.value.toFixed(2)}`
      );
    } else {
      formattedData.items = data.items.map((item: any, index: number) => 
        `${index + 1}. ${item.quantity}x ${item.description} (SKU: ${item.hsCode})`
      );
    }
    
    response += JSON.stringify(formattedData, null, 2);
  } else {
    response += JSON.stringify(data, null, 2);
  }

  response += `\n\n❓ Do you want me to proceed and ${requirements.description.toLowerCase()}?`;

  return response;
}

async function executeAction(actionData: any, tenantId: string): Promise<NextResponse> {
  try {
    const { intent, data, endpoint, method } = actionData;

    let response;
    let result;

    switch (intent) {
      case 'create_shipment': {
        // Handle items weight and value distribution
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          const totalWeight = data.weight || 0;
          const totalValue = data.totalValue || 0;

          // Distribute weight and value among items if not provided
          data.items = data.items.map((item: any) => ({
            ...item,
            weight: item.weight || (totalWeight / data.items.length),
            value: item.value || (totalValue / data.items.length)
          }));
        }
        result = await Shipment.create({ ...data, tenantId });
        break;
      }

      case 'update_shipment': {
        // Find shipment by shipmentNumber first
        const shipmentToUpdate = await Shipment.findOne({ shipmentNumber: data.id, tenantId });
        if (!shipmentToUpdate) {
          throw new Error('Shipment not found with that shipment number');
        }
        // Remove id from data since it's the shipmentNumber, not _id
        const { id, ...shipmentUpdateData } = data;
        result = await Shipment.findOneAndUpdate(
          { _id: shipmentToUpdate._id, tenantId },
          { $set: shipmentUpdateData },
          { new: true },
        );
        if (!result) {
          throw new Error('Shipment not found');
        }
        break;
      }

      case 'delete_shipment': {
        // Find shipment by shipmentNumber first
        const shipmentToDelete = await Shipment.findOne({ shipmentNumber: data.id, tenantId });
        if (!shipmentToDelete) {
          throw new Error('Shipment not found with that shipment number');
        }
        result = await Shipment.findOneAndDelete({ _id: shipmentToDelete._id, tenantId });
        if (!result) {
          throw new Error('Shipment not found');
        }
        break;
      }

      case 'create_hs_code': {
        result = await HSCode.create({ ...data, tenantId });
        break;
      }

      case 'update_hs_code': {
        // Find HS code by hsCode first
        const hsCodeToUpdate = await HSCode.findOne({ hsCode: data.id, tenantId });
        if (!hsCodeToUpdate) {
          throw new Error('HS Code not found with that code');
        }
        // Remove id from data since it's the hsCode, not _id
        const { id: hsCodeId, ...hsCodeUpdateData } = data;
        result = await HSCode.findOneAndUpdate(
          { _id: hsCodeToUpdate._id, tenantId },
          { $set: hsCodeUpdateData },
          { new: true },
        );
        if (!result) {
          throw new Error('HS Code not found');
        }
        break;
      }

      case 'delete_hs_code': {
        // Find HS code by hsCode first
        const hsCodeToDelete = await HSCode.findOne({ hsCode: data.id, tenantId });
        if (!hsCodeToDelete) {
          throw new Error('HS Code not found with that code');
        }
        result = await HSCode.findOneAndDelete({ _id: hsCodeToDelete._id, tenantId });
        if (!result) {
          throw new Error('HS Code not found');
        }
        break;
      }

      case 'create_air_freight': {
        // Convert string dates to Date objects
        if (data.departureTime) data.departureTime = new Date(data.departureTime);
        if (data.arrivalTime) data.arrivalTime = new Date(data.arrivalTime);
        result = await AirFreight.create({ ...data, tenantId });
        break;
      }

      case 'update_air_freight': {
        if (!data.id) {
          throw new Error('Air freight ID is required for update');
        }
        if (data.departureTime) data.departureTime = new Date(data.departureTime);
        if (data.arrivalTime) data.arrivalTime = new Date(data.arrivalTime);
        result = await AirFreight.findOneAndUpdate(
          { _id: data.id, tenantId },
          { $set: data },
          { new: true },
        );
        if (!result) {
          throw new Error('Air freight record not found');
        }
        break;
      }

      case 'delete_air_freight': {
        if (!data.id) {
          throw new Error('Air freight ID is required for deletion');
        }
        result = await AirFreight.findOneAndDelete({ _id: data.id, tenantId });
        if (!result) {
          throw new Error('Air freight record not found');
        }
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown action type' }, { status: 400 });
    }

    const action = intent.split('_')[0];
    const entity = intent.split('_').slice(1).join(' ').replace(/\b\w/g, l => l.toUpperCase());

    let successMessage;
    if (action === 'delete') {
      successMessage = `✅ ${entity} deleted successfully!`;
    } else {
      successMessage = `✅ ${entity} ${action}d successfully!\n\n📋 Details:\n${JSON.stringify(result, null, 2)}`;
    }

    return NextResponse.json({
      response: successMessage,
      success: true,
      result
    });

  } catch (error: any) {
    console.error('Error executing action:', error);
    return NextResponse.json({ 
      response: `❌ Error: ${error.message || 'Failed to execute action'}`,
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}
