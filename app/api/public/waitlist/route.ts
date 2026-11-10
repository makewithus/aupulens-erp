import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { connectBaseDB } from "@/lib/db";
import Waitlist from "@/models/platform/Waitlist";
import { sendWaitlistNotificationEmail } from "@/lib/email/waitlistNotification";

// In-memory rate limiting map for edge/route protection: IP -> { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  // Occasional cleanup
  if (rateLimitMap.size > 1000) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (val.resetAt <= now) rateLimitMap.delete(key);
    }
  }

  const record = rateLimitMap.get(ip);
  if (!record || record.resetAt <= now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count += 1;
  return true;
}

const waitlistSubmissionSchema = z.object({
  fullName: z.string().trim().max(120).optional().default(""),
  name: z.string().trim().max(120).optional(),
  companyName: z.string().trim().max(150).optional(),
  company: z.string().trim().max(150).optional(),
  email: z
    .string()
    .trim()
    .max(254)
    .email("Please provide a valid email address.")
    .toLowerCase(),
  phone: z.string().trim().max(40).optional().default(""),
  teamSize: z.string().trim().max(50).optional().default(""),
  team_size: z.string().trim().max(50).optional(),
  topic: z.string().trim().max(100).optional().default(""),
  plan: z.string().trim().max(50).optional().default(""),
  message: z.string().trim().max(3000).optional().default(""),
  formType: z.enum(["book_demo", "contact"]).optional().default("book_demo"),
  sourceUrl: z.string().trim().max(500).optional().default(""),
  _hp: z.string().optional(), // Honeypot
});

function getCorsHeaders(origin: string | null) {
  const allowedOrigins = [
    "https://aupulens.com",
    "https://www.aupulens.com",
    "https://erp.aupulens.com",
  ];

  let allowOrigin = "https://aupulens.com";
  if (origin) {
    if (
      allowedOrigins.includes(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
    ) {
      allowOrigin = origin;
    }
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

function generateWaitlistId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `WAIT-${dateStr}-${randomStr}`;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  // Rate Limiting
  if (!checkIpRateLimit(ip)) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many requests. Please wait a moment before trying again.",
      },
      { status: 429, headers: corsHeaders }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid request payload.",
      },
      { status: 400, headers: corsHeaders }
    );
  }

  // Schema Validation
  const parseResult = waitlistSubmissionSchema.safeParse(body);
  if (!parseResult.success) {
    const errorMsg =
      parseResult.error.issues[0]?.message || "Validation failed.";
    return NextResponse.json(
      {
        success: false,
        message: errorMsg,
        errors: parseResult.error.format(),
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const data = parseResult.data;

  // Honeypot Protection: Bots that fill this hidden field are silently acknowledged without action
  if (data._hp && data._hp.trim() !== "") {
    return NextResponse.json(
      {
        success: true,
        waitlistId: generateWaitlistId(),
        message: "Request received.",
      },
      { status: 200, headers: corsHeaders }
    );
  }

  // Field Normalization across form varieties
  const effectiveCompanyName = (data.companyName || data.company || "").trim();
  const effectiveFullName = (data.fullName || data.name || "").trim();
  const effectiveTeamSize = (data.teamSize || data.team_size || "").trim();

  if (!effectiveCompanyName) {
    return NextResponse.json(
      {
        success: false,
        message: "Company name is required.",
      },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Only the Waitlist model is used here (no populate, no cross-model hooks), so the cheap connection is
    // enough — it skips compiling the ~100 unrelated schemas on this public cold-start path.
    await connectBaseDB();

    // Duplicate submission protection (within 60 seconds for same email and company)
    const recentDuplicate = await Waitlist.findOne({
      email: data.email,
      companyName: effectiveCompanyName,
      formType: data.formType,
      submittedAt: { $gte: new Date(Date.now() - 60_000) },
    })
      .select("waitlistId status")
      .lean();

    if (recentDuplicate) {
      return NextResponse.json(
        {
          success: true,
          waitlistId: recentDuplicate.waitlistId,
          message: "Request already received. You are on the waitlist!",
        },
        { status: 200, headers: corsHeaders }
      );
    }

    const waitlistId = generateWaitlistId();
    const userAgent = request.headers.get("user-agent") || undefined;

    // 1. Create and save the Waitlist record first
    const waitlistRecord = new Waitlist({
      waitlistId,
      fullName: effectiveFullName || undefined,
      companyName: effectiveCompanyName,
      email: data.email,
      phone: data.phone || undefined,
      teamSize: effectiveTeamSize || undefined,
      topic: data.topic || undefined,
      plan: data.plan || undefined,
      message: data.message || undefined,
      formType: data.formType,
      status: "New",
      sourceUrl: data.sourceUrl || origin || undefined,
      ipAddress: ip,
      userAgent: userAgent ? userAgent.slice(0, 500) : undefined,
      emailDeliveryStatus: "pending",
      submittedAt: new Date(),
    });

    await waitlistRecord.save();

    // 2. Dispatch Email Notification independently
    try {
      const emailResult = await sendWaitlistNotificationEmail(waitlistRecord);
      if (emailResult.success) {
        waitlistRecord.emailDeliveryStatus = "sent";
        waitlistRecord.emailDeliveryAt = new Date();
      } else {
        waitlistRecord.emailDeliveryStatus = "failed";
        waitlistRecord.emailDeliveryError = emailResult.message;
      }
      await waitlistRecord.save();
    } catch (emailErr: any) {
      console.error("[waitlist] Notification email error:", emailErr?.message || emailErr);
      waitlistRecord.emailDeliveryStatus = "failed";
      waitlistRecord.emailDeliveryError = String(emailErr?.message || emailErr).slice(0, 500);
      await waitlistRecord.save().catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        waitlistId,
        message: "Thank you for reaching out. You have been added to the waitlist!",
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (dbErr: any) {
    console.error("[waitlist] Submission database error:", dbErr?.message || dbErr);
    return NextResponse.json(
      {
        success: false,
        message:
          "Something went wrong. Please try again or email us at contact@aupulens.com.",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

