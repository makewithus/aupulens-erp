import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { friendlyError } from "@/lib/errors/friendlyError";
import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";

/**
 * Checks if a string is a valid 24-character hexadecimal MongoDB ObjectId.
 */
export function isValidObjectId(id: unknown): boolean {
  if (typeof id !== "string") {
    return false;
  }
  return /^[0-9a-fA-F]{24}$/.test(id) && mongoose.Types.ObjectId.isValid(id);
}

/**
 * Validates route parameter `id`. Returns HTTP 400 NextResponse if invalid, or null if valid.
 */
export function validateObjectId(id: unknown): NextResponse | null {
  if (!isValidObjectId(id)) {
    return NextResponse.json(
      { error: "Invalid identifier format" },
      { status: 400 }
    );
  }
  return null;
}

/**
 * Common route error handler that returns 400 for CastError / malformed IDs and 500 for internal errors.
 */
export function handleRouteError(error: any): NextResponse {
  if (error?.name === "CastError" || error?.name === "BSONError" || /Cast to ObjectId/i.test(error?.message || "")) {
    return NextResponse.json(
      { error: "Invalid identifier format" },
      { status: 400 }
    );
  }
  // Mongoose validation and duplicate-key errors have known, scrubbed user
  // messages. Unknown exceptions may contain collection names, query details,
  // IDs or secrets, so keep them server-side.
  if (error?.name === "ValidationError" || error?.name === "ValidatorError" || error?.code === 11000) {
    return NextResponse.json(
      { error: friendlyError(error, "We couldn't complete this request. Please try again.") },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: safeInternalErrorMessage(), code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}

/**
 * Protected system fields that should NEVER be overwritten via generic client update payloads.
 */
export const PROTECTED_SYSTEM_FIELDS = [
  "_id",
  "id",
  "tenantId",
  "organizationId",
  "orgId",
  "createdBy",
  "createdAt",
  "updatedAt",
  "isOwner",
  "isSystemSeeded",
  "isDemo",
  "approvalRequired",
  "approvalDetails",
  "validatedAt", "validatedBy", "ledgerUpdatedAt", "postedSnapshot",
  "journalEntryIds", "journalEntryId", "passwordHash",
  "permissions", "tempToken", "tempTokenHash", "tempTokenExpiry",
  "passwordResetTokenHash", "passwordResetTokenExpiry",
] as const;

/**
 * Strips protected system and security fields from an update payload to prevent mass assignment.
 */
export function stripProtectedFields<T extends Record<string, any>>(
  payload: T,
  additionalProtected: string[] = []
): Partial<T> {
  if (!payload || typeof payload !== "object") return {};
  if (Array.isArray(payload)) return {};
  const allProtected = new Set([...PROTECTED_SYSTEM_FIELDS, ...additionalProtected]);

  const sanitize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== "object") return value;

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;

    const cleaned: Record<string, unknown> = {};
    for (const [field, nestedValue] of Object.entries(value)) {
      // MongoDB interprets dotted paths and update operators at every level.
      // Remove protected segments in both dotted keys and nested objects.
      if (field.startsWith("$") || field.split(".").some((part) => allProtected.has(part))) {
        continue;
      }
      cleaned[field] = sanitize(nestedValue);
    }
    return cleaned;
  };

  return sanitize(payload) as Partial<T>;
}

