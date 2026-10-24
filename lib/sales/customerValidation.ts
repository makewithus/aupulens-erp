/**
 * Customer email and phone validation rules.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Standard phone format: requires 7 to 15 digits; allows optional leading +, spaces, parentheses, hyphens
const PHONE_CHARS_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;

export function isValidEmail(email?: string | null): boolean {
  if (!email || !email.trim()) return true; // Optional field
  return EMAIL_REGEX.test(email.trim());
}

export function isValidPhone(phone?: string | null): boolean {
  if (!phone || !phone.trim()) return true; // Optional field
  const trimmed = phone.trim();
  if (!PHONE_CHARS_REGEX.test(trimmed)) return false;
  const digitsOnly = trimmed.replace(/\D/g, "");
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

export function validateCustomerInput(body: {
  contact_details?: {
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
  };
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const details = body.contact_details;
  if (details) {
    if (details.email && !isValidEmail(details.email)) {
      errors.push("Invalid email address format");
    }
    if (details.phone && !isValidPhone(details.phone)) {
      errors.push("Invalid phone number format (must contain 7-15 digits)");
    }
    if (details.mobile && !isValidPhone(details.mobile)) {
      errors.push("Invalid mobile number format (must contain 7-15 digits)");
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}
