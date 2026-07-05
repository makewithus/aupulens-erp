// No SMTP/Resend/SendGrid provider is configured anywhere in this codebase
// yet. Rather than fake delivery, every call path (Reminders, Dunning,
// Subscription Email Notifications) goes through this one clean interface —
// swap sendEmailStub for a real provider call once credentials exist, with
// no changes needed at any call site. Same pattern as lib/einvoice/gspService.ts
// and lib/sales/gstinLookup.ts.
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: "stub";
  message: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

// TODO: replace with a real provider (Resend/SendGrid/SES/SMTP) once an API
// key or SMTP credentials are available in the environment. Until then this
// logs the send (so the call path is real and observable) and reports
// success, since no external dependency exists to actually fail against.
class StubEmailService implements EmailService {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.log(`[stub-email] to=${message.to} subject="${message.subject}"`);
    return { success: true, provider: "stub", message: "Logged only — no email provider configured yet." };
  }
}

let instance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!instance) instance = new StubEmailService();
  return instance;
}

export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ""));
}
