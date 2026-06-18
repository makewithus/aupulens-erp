import { NextRequest } from "next/server";

export function maskSensitiveData(data: any): any {
  if (!data) return data;
  
  const masked = { ...data };
  
  if (masked.phone) {
    masked.phone = masked.phone.replace(/.(?=.{4})/g, '*');
  }
  
  if (masked.ssn || masked.social_security) {
    masked.ssn = "***-**-****";
    masked.social_security = "***-**-****";
  }
  
  if (masked.credit_card) {
    masked.credit_card = "****-****-****-" + masked.credit_card.slice(-4);
  }

  return masked;
}

export function validateCronSecret(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || "dev-cron-secret"}`) {
    throw new Error("Unauthorized CRON execution");
  }
}

// In a real app, this would use Redis. For the CRM architecture, we mock the concept
const rateLimitCache = new Map<string, number>();

export function checkRateLimit(identifier: string, limit: number = 100, windowMs: number = 60000) {
  const now = Date.now();
  const record = rateLimitCache.get(identifier) || 0;
  
  if (record > limit) {
    throw new Error("Rate limit exceeded. Try again later.");
  }
  
  rateLimitCache.set(identifier, record + 1);
  setTimeout(() => {
    rateLimitCache.set(identifier, Math.max(0, (rateLimitCache.get(identifier) || 1) - 1));
  }, windowMs);
}
