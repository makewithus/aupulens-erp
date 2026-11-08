import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: string;
  message: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

class NodemailerEmailService implements EmailService {
  private transporter: nodemailer.Transporter | null = null;

  async init() {
    if (this.transporter) return;
    
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "").replace(/\s+/g, "");
    const smtpHost = process.env.SMTP_HOST?.trim() || (smtpUser?.includes("@gmail.com") ? "smtp.gmail.com" : "");
    const smtpPort = Number(process.env.SMTP_PORT) || 587;

    if (smtpUser && smtpPass) {
      if (smtpUser.includes("@gmail.com") && !process.env.SMTP_HOST) {
        this.transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
      } else if (smtpHost) {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
      }
    } else {
      throw new Error("SMTP is not configured.");
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      await this.init();
      const smtpUser = process.env.SMTP_USER;
      const fromAddress = process.env.SMTP_FROM || (smtpUser ? `"Aupulens" <${smtpUser}>` : '"Aupulens" <contact@aupulens.com>');
      const info = await this.transporter!.sendMail({
        from: fromAddress,
        to: message.to,
        subject: message.subject,
        text: message.body,
        ...(message.html && { html: message.html }),
        ...(message.replyTo && { replyTo: message.replyTo }),
      });

      return { success: true, provider: "smtp", message: "Email sent successfully" };
    } catch (error: any) {
      console.error("[email] Delivery failure:", error?.message || error);
      return {
        success: false,
        provider: "smtp",
        message: error?.message || (this.transporter ? "Email delivery failed." : "Email delivery is not configured."),
      };
    }
  }
}

let instance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!instance) instance = new NodemailerEmailService();
  return instance;
}

export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ""));
}
