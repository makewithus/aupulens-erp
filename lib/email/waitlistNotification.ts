import { getEmailService, EmailSendResult } from "./sendEmail";
import { IWaitlist } from "@/models/platform/Waitlist";

function escapeHtml(str: string | undefined | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatISTTimestamp(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(date) + " IST";
}

export async function sendWaitlistNotificationEmail(
  record: IWaitlist
): Promise<EmailSendResult> {
  const isBookDemo = record.formType === "book_demo";
  const visitorDisplayName =
    record.fullName?.trim() || record.companyName?.trim() || record.email;

  // Clear subject line per specification
  const subject = isBookDemo
    ? `[Aupulens] Book now: ${visitorDisplayName}`
    : `[Aupulens] Contact: ${visitorDisplayName}`;

  const submissionTimeIST = formatISTTimestamp(record.submittedAt || new Date());
  const formLabel = isBookDemo ? "Book a Demo" : "Contact Form";

  // Build Plaintext Body
  const textLines: string[] = [
    `=== AUPULENS NEW SUBMISSION ===`,
    `Form Type: ${formLabel}`,
    `Waitlist ID: ${record.waitlistId}`,
    `Submission Time: ${submissionTimeIST}`,
    `Page URL: ${record.sourceUrl || "https://aupulens.com"}`,
    ``,
    `--- VISITOR & COMPANY DETAILS ---`,
    `Contact Person: ${record.fullName || "Not provided"}`,
    `Company: ${record.companyName}`,
    `Email: ${record.email}`,
    `Phone: ${record.phone || "Not provided"}`,
  ];

  if (record.teamSize) {
    textLines.push(`Team Size: ${record.teamSize}`);
  }
  if (record.topic) {
    textLines.push(`Interest / Topic: ${record.topic}`);
  }
  if (record.plan) {
    textLines.push(`Plan: ${record.plan}`);
  }
  if (record.message) {
    textLines.push(``, `Message:`, record.message);
  }

  textLines.push(``, `--- END OF SUBMISSION ---`);
  const body = textLines.join("\n");

  // Build HTML Body (Escaped & Styled)
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #e2e8f0; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 8px; overflow: hidden; }
    .header { background-color: #1e293b; padding: 20px 24px; border-bottom: 1px solid #334155; }
    .header-badge { display: inline-block; font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; }
    .header h2 { margin: 0; font-size: 20px; color: #f8fafc; font-weight: 600; }
    .content { padding: 24px; }
    .field-group { margin-bottom: 20px; }
    .table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .table th, .table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #1f2937; font-size: 14px; }
    .table th { color: #94a3b8; font-weight: 500; width: 35%; }
    .table td { color: #f1f5f9; font-weight: 400; }
    .highlight { color: #38bdf8; font-weight: 600; }
    .message-box { margin-top: 16px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 6px; padding: 16px; color: #cbd5e1; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
    .footer { background-color: #0b0f17; padding: 16px 24px; border-top: 1px solid #1f2937; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-badge">// SUBMISSION RECEIVED • ${escapeHtml(formLabel)}</div>
      <h2>${escapeHtml(subject)}</h2>
    </div>
    <div class="content">
      <table class="table">
        <tr>
          <th>Waitlist ID</th>
          <td><code>${escapeHtml(record.waitlistId)}</code></td>
        </tr>
        <tr>
          <th>Company</th>
          <td class="highlight">${escapeHtml(record.companyName)}</td>
        </tr>
        <tr>
          <th>Contact Person</th>
          <td><strong>${escapeHtml(record.fullName || "Not provided")}</strong></td>
        </tr>
        <tr>
          <th>Email</th>
          <td><a href="mailto:${escapeHtml(record.email)}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(record.email)}</a></td>
        </tr>
        <tr>
          <th>Phone</th>
          <td>${escapeHtml(record.phone || "Not provided")}</td>
        </tr>
        ${record.teamSize ? `<tr><th>Team Size</th><td>${escapeHtml(record.teamSize)}</td></tr>` : ""}
        ${record.topic ? `<tr><th>Topic</th><td>${escapeHtml(record.topic)}</td></tr>` : ""}
        ${record.plan ? `<tr><th>Plan</th><td>${escapeHtml(record.plan)}</td></tr>` : ""}
        <tr>
          <th>Submission Time (IST)</th>
          <td>${escapeHtml(submissionTimeIST)}</td>
        </tr>
        <tr>
          <th>Source Page</th>
          <td><a href="${escapeHtml(record.sourceUrl || "https://aupulens.com")}" style="color: #94a3b8; font-size: 12px;">${escapeHtml(record.sourceUrl || "https://aupulens.com")}</a></td>
        </tr>
      </table>

      ${
        record.message
          ? `
        <div style="margin-top: 20px;">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px;">Message:</div>
          <div class="message-box">${escapeHtml(record.message)}</div>
        </div>
      `
          : ""
      }
    </div>
    <div class="footer">
      This notification was automatically sent by Aupulens ERP. Hitting Reply directly addresses <strong>${escapeHtml(record.email)}</strong>.
    </div>
  </div>
</body>
</html>
  `.trim();

  const emailService = getEmailService();
  const recipient = process.env.WAITLIST_NOTIFICATION_EMAIL || "contact@aupulens.com";

  return await emailService.send({
    to: recipient,
    subject,
    body,
    html,
    replyTo: record.email,
  });
}

