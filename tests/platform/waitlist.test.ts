import { describe, it, expect, vi } from "vitest";
import { formatISTTimestamp, sendWaitlistNotificationEmail } from "@/lib/email/waitlistNotification";
import * as sendEmailModule from "@/lib/email/sendEmail";

describe("Waitlist Email Notification and Formatting", () => {
  it("formats timestamp in IST with 24h/12h and timeZone Asia/Kolkata", () => {
    const testDate = new Date("2026-11-07T12:00:00Z");
    const formatted = formatISTTimestamp(testDate);
    expect(formatted).toContain("IST");
    expect(formatted).toContain("2026");
  });

  it("sends Book a Demo email with correct subject, recipient, and replyTo", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      success: true,
      provider: "smtp",
      message: "Email sent successfully",
    });

    vi.spyOn(sendEmailModule, "getEmailService").mockReturnValue({
      send: mockSend,
    });

    const mockWaitlistRecord: any = {
      waitlistId: "WAIT-20261107-ABC123",
      fullName: "Jane Doe",
      companyName: "Acme Corp",
      email: "jane@acmecorp.com",
      phone: "+91 9876543210",
      formType: "book_demo",
      submittedAt: new Date(),
      sourceUrl: "https://aupulens.com",
    };

    const result = await sendWaitlistNotificationEmail(mockWaitlistRecord);

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.to).toBe("contact@aupulens.com");
    expect(callArg.subject).toBe("[Aupulens] Book now: Jane Doe");
    expect(callArg.replyTo).toBe("jane@acmecorp.com");
    expect(callArg.body).toContain("WAIT-20261107-ABC123");
    expect(callArg.body).toContain("Acme Corp");
    expect(callArg.body).toContain("jane@acmecorp.com");
    expect(callArg.html).toContain("Acme Corp");
    expect(callArg.html).toContain("Jane Doe");
  });

  it("escapes malicious scripts and characters in email HTML", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      success: true,
      provider: "smtp",
      message: "Email sent successfully",
    });

    vi.spyOn(sendEmailModule, "getEmailService").mockReturnValue({
      send: mockSend,
    });

    const maliciousRecord: any = {
      waitlistId: "WAIT-XSS",
      fullName: '<script>alert("xss")</script>',
      companyName: '<img src=x onerror=alert(1)>',
      email: "hacker@test.com",
      formType: "contact",
      message: '<b>Hello</b> "quote" & \'apos\'',
      submittedAt: new Date(),
    };

    await sendWaitlistNotificationEmail(maliciousRecord);

    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.subject).toContain("[Aupulens] Contact: <script>alert(\"xss\")</script>"); // Subject is text
    expect(callArg.html).not.toContain('<script>alert("xss")</script>');
    expect(callArg.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(callArg.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it("handles fallback to companyName when visitor name is empty", async () => {
    const mockSend = vi.fn().mockResolvedValue({
      success: true,
      provider: "smtp",
      message: "Email sent successfully",
    });

    vi.spyOn(sendEmailModule, "getEmailService").mockReturnValue({
      send: mockSend,
    });

    const noNameRecord: any = {
      waitlistId: "WAIT-NONAME",
      companyName: "Acme Enterprises",
      email: "info@acme.com",
      formType: "book_demo",
      submittedAt: new Date(),
    };

    await sendWaitlistNotificationEmail(noNameRecord);

    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.subject).toBe("[Aupulens] Book now: Acme Enterprises");
    expect(callArg.replyTo).toBe("info@acme.com");
  });
});
