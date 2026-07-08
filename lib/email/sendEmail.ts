import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
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
    
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    const smtpHost = process.env.SMTP_HOST || (smtpUser?.includes("@gmail.com") ? "smtp.gmail.com" : "");
    const smtpPort = Number(process.env.SMTP_PORT) || 587;

    if (smtpHost && smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    } else {
      console.log("No SMTP credentials found. Creating Ethereal test account...");
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      await this.init();
      const info = await this.transporter!.sendMail({
        from: '"Aupulens ERP" <noreply@aupulens.online>',
        to: message.to,
        subject: message.subject,
        text: message.body,
        ...(message.html && { html: message.html }),
      });

      console.log(`[nodemailer] Message sent: %s`, info.messageId);
      const testUrl = nodemailer.getTestMessageUrl(info);
      if (testUrl) {
        console.log(`[nodemailer] Preview URL: %s`, testUrl);
      }

      return { success: true, provider: "nodemailer", message: "Email sent successfully" };
    } catch (error: any) {
      console.error("[nodemailer] Error sending email:", error);
      return { success: false, provider: "nodemailer", message: error.message };
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
