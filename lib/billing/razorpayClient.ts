import crypto from "node:crypto";

export interface CreateOrderParams {
  amount: number; // in Rupees / major currency units
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResponse {
  id: string;
  entity: string;
  amount: number; // in paise
  currency: string;
  receipt: string;
  status: string;
  notes?: Record<string, string>;
  created_at: number;
}

export interface VerifyPaymentSignatureParams {
  razorpayOrderId?: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  razorpaySubscriptionId?: string;
}

export class RazorpayService {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || this.keySecret;
  }

  public isConfigured(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  public getKeyId(): string {
    return this.keyId || "rzp_test_placeholder_key";
  }

  /**
   * Constant-time comparison to prevent timing attacks.
   */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Creates an order with Razorpay Orders API.
   * In test environment without network/credentials, returns a deterministic mock order.
   */
  public async createOrder(params: CreateOrderParams): Promise<RazorpayOrderResponse> {
    const amountInPaise = Math.round(params.amount * 100);
    const currency = (params.currency || "INR").toUpperCase();

    // If live credentials configured and not strictly in unit test, execute real API call
    if (this.isConfigured() && process.env.NODE_ENV !== "test") {
      const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`;
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency,
          receipt: params.receipt,
          notes: params.notes,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Razorpay order creation failed: ${response.status} ${errorText}`);
      }

      return (await response.json()) as RazorpayOrderResponse;
    }

    // Mock order for test/development mode
    return {
      id: `order_${crypto.randomBytes(8).toString("hex")}`,
      entity: "order",
      amount: amountInPaise,
      currency,
      receipt: params.receipt,
      status: "created",
      notes: params.notes,
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Verifies standard Razorpay Payment signature.
   * If razorpaySubscriptionId is passed: paymentId + "|" + subscriptionId
   * If razorpayOrderId is passed: orderId + "|" + paymentId
   */
  public verifyPaymentSignature(params: VerifyPaymentSignatureParams): boolean {
    const secret = this.keySecret || "test_secret_for_local_verification";
    let payload = "";

    if (params.razorpaySubscriptionId) {
      payload = `${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`;
    } else if (params.razorpayOrderId) {
      payload = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
    } else {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return this.safeEqual(expectedSignature, params.razorpaySignature.trim());
  }

  /**
   * Generates a valid test signature for automated tests.
   */
  public generateTestSignature(orderOrSubId: string, paymentId: string, isSub = false): string {
    const secret = this.keySecret || "test_secret_for_local_verification";
    const payload = isSub ? `${paymentId}|${orderOrSubId}` : `${orderOrSubId}|${paymentId}`;
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  /**
   * Verifies webhook payload signature from Razorpay.
   */
  public verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean {
    if (!signature) return false;
    const secret = this.webhookSecret || this.keySecret || "test_secret_for_local_verification";
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return this.safeEqual(expected, signature.trim());
  }

  /**
   * Generates a valid test webhook signature for automated tests.
   */
  public generateTestWebhookSignature(rawBody: string): string {
    const secret = this.webhookSecret || this.keySecret || "test_secret_for_local_verification";
    return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  }
}

export const razorpayService = new RazorpayService();
