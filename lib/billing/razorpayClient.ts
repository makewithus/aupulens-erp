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

export interface RazorpayRefundResponse {
  id: string;
  entity: "refund";
  amount: number; // in paise
  currency: string;
  payment_id: string;
  status: "created" | "processed" | "failed";
  created_at: number;
  notes?: Record<string, string>;
}

export interface RazorpayPaymentResponse {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: string;
  order_id?: string;
}

export interface VerifyPaymentSignatureParams {
  razorpayOrderId?: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  razorpaySubscriptionId?: string;
}

export interface RazorpayPlanResponse {
  id: string;
  period: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  item: { amount: number; currency: string };
}

export interface RazorpaySubscriptionResponse {
  id: string;
  status: "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired";
  plan_id: string;
  customer_id?: string | null;
  start_at?: number | null;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  total_count: number;
  paid_count: number;
  short_url?: string | null;
  has_scheduled_changes?: boolean;
  notes?: Record<string, string>;
}

export class RazorpayService {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(config?: { keyId?: string; keySecret?: string; webhookSecret?: string }) {
    this.keyId = config?.keyId ?? process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
    this.keySecret = config?.keySecret ?? process.env.RAZORPAY_KEY_SECRET ?? "";
    this.webhookSecret = config?.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  }

  public isConfigured(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  public getKeyId(): string {
    return this.keyId;
  }

  private async apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.isConfigured()) throw new Error("Razorpay credentials are required for subscription management.");
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Razorpay subscription request failed with status ${response.status}.`);
    return response.json() as Promise<T>;
  }

  public async fetchPlan(planId: string): Promise<RazorpayPlanResponse> {
    if (!/^plan_[A-Za-z0-9]+$/.test(planId)) throw new Error("A valid Razorpay plan ID is required.");
    const plan = await this.apiRequest<RazorpayPlanResponse>(`/plans/${encodeURIComponent(planId)}`);
    if (plan.id !== planId || !Number.isInteger(plan.item?.amount) || !plan.item.currency) {
      throw new Error("Razorpay returned an invalid subscription plan.");
    }
    return plan;
  }

  public async createSubscription(params: {
    planId: string;
    totalCount: number;
    startAt: number;
    expireBy: number;
    notes: Record<string, string>;
  }): Promise<RazorpaySubscriptionResponse> {
    const result = await this.apiRequest<RazorpaySubscriptionResponse>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        plan_id: params.planId,
        total_count: params.totalCount,
        start_at: params.startAt,
        expire_by: params.expireBy,
        customer_notify: false,
        notes: params.notes,
      }),
    });
    if (!result.id || result.plan_id !== params.planId || !result.short_url || result.status !== "created") {
      throw new Error("Razorpay returned an invalid subscription authorization response.");
    }
    return result;
  }

  public async fetchSubscription(subscriptionId: string): Promise<RazorpaySubscriptionResponse> {
    const result = await this.apiRequest<RazorpaySubscriptionResponse>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
    if (result.id !== subscriptionId) throw new Error("Razorpay returned a mismatched subscription reference.");
    return result;
  }

  public async cancelSubscription(subscriptionId: string, cancelAtCycleEnd = true): Promise<RazorpaySubscriptionResponse> {
    const result = await this.apiRequest<RazorpaySubscriptionResponse>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd }) }
    );
    if (result.id !== subscriptionId) throw new Error("Razorpay returned a mismatched subscription reference.");
    return result;
  }

  public async cancelScheduledSubscriptionChanges(subscriptionId: string): Promise<RazorpaySubscriptionResponse> {
    const result = await this.apiRequest<RazorpaySubscriptionResponse>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel_scheduled_changes`,
      { method: "POST", body: JSON.stringify({}) }
    );
    if (result.id !== subscriptionId) throw new Error("Razorpay returned a mismatched subscription reference.");
    return result;
  }

  /** Creates a real refund through Razorpay. Never synthesizes a successful refund. */
  public async createRefund(params: {
    paymentId: string;
    amount: number;
    currency: string;
    reason: string;
    refundRequestId?: string;
  }): Promise<RazorpayRefundResponse> {
    if (!this.isConfigured()) {
      throw new Error("Razorpay credentials are required to issue refunds.");
    }
    if (!params.paymentId || !Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error("A valid payment reference and positive refund amount are required.");
    }

    const response = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(params.paymentId)}/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        },
        body: JSON.stringify({
          amount: Math.round(params.amount * 100),
          notes: {
            reason: params.reason.slice(0, 256),
            ...(params.refundRequestId ? { billing_refund_id: params.refundRequestId } : {}),
          },
        }),
      }
    );

    if (!response.ok) {
      // Avoid including provider response bodies, which can contain sensitive data.
      throw new Error(`Razorpay refund request failed with status ${response.status}.`);
    }
    const refund = (await response.json()) as RazorpayRefundResponse;
    if (
      !refund.id ||
      refund.payment_id !== params.paymentId ||
      refund.amount !== Math.round(params.amount * 100) ||
      refund.currency !== params.currency ||
      !["created", "processed", "failed"].includes(refund.status)
    ) {
      throw new Error("Razorpay returned an invalid refund response.");
    }
    return refund;
  }

  /** Lists authoritative refunds for a payment so ambiguous requests can be reconciled safely. */
  public async fetchRefundsForPayment(paymentId: string): Promise<RazorpayRefundResponse[]> {
    if (!this.isConfigured()) throw new Error("Razorpay credentials are required to reconcile refunds.");
    if (!paymentId) throw new Error("A payment reference is required to reconcile refunds.");
    const response = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refunds?count=100`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        },
      }
    );
    if (!response.ok) throw new Error(`Razorpay refund lookup failed with status ${response.status}.`);
    const result = await response.json() as { items?: RazorpayRefundResponse[] };
    if (!Array.isArray(result.items)) throw new Error("Razorpay returned an invalid refund list.");
    return result.items.filter((refund) =>
      refund.entity === "refund" && refund.payment_id === paymentId &&
      typeof refund.id === "string" && Number.isInteger(refund.amount) &&
      ["created", "processed", "failed"].includes(refund.status)
    );
  }

  /** Fetches the authoritative provider payment state for server verification. */
  public async fetchPayment(paymentId: string): Promise<RazorpayPaymentResponse> {
    if (!this.isConfigured()) {
      throw new Error("Razorpay credentials are required to verify provider payment state.");
    }
    const response = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Razorpay payment lookup failed with status ${response.status}.`);
    }
    const payment = (await response.json()) as RazorpayPaymentResponse;
    if (!payment.id || payment.id !== paymentId) {
      throw new Error("Razorpay returned a mismatched payment reference.");
    }
    return payment;
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

  /** Creates an order with Razorpay; synthetic order IDs are restricted to automated tests. */
  public async createOrder(params: CreateOrderParams): Promise<RazorpayOrderResponse> {
    const amountInPaise = Math.round(params.amount * 100);
    const currency = (params.currency || "INR").toUpperCase();

    // Test fixtures may use synthetic orders, but every real runtime must use Razorpay.
    if (process.env.NODE_ENV === "test") {
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

    if (!this.isConfigured()) {
      throw new Error("Razorpay credentials are required to create payment orders.");
    }

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
      throw new Error(`Razorpay order creation failed with status ${response.status}.`);
    }
    return (await response.json()) as RazorpayOrderResponse;
  }

  /**
   * Verifies standard Razorpay Payment signature.
   * If razorpaySubscriptionId is passed: paymentId + "|" + subscriptionId
   * If razorpayOrderId is passed: orderId + "|" + paymentId
   */
  public verifyPaymentSignature(params: VerifyPaymentSignatureParams): boolean {
    const secret = this.keySecret || (process.env.NODE_ENV === "test" ? "test_secret_for_local_verification" : "");
    if (!secret) return false;
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
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Test signatures are available only in the test runtime.");
    }
    const secret = this.keySecret || "test_secret_for_local_verification";
    const payload = isSub ? `${paymentId}|${orderOrSubId}` : `${orderOrSubId}|${paymentId}`;
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  /**
   * Verifies webhook payload signature from Razorpay.
   */
  public verifyWebhookSignature(rawBody: string, signature: string | null | undefined): boolean {
    if (!signature) return false;
    const secret = this.webhookSecret || (process.env.NODE_ENV === "test" ? "test_secret_for_local_verification" : "");
    if (!secret) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return this.safeEqual(expected, signature.trim());
  }

  /**
   * Generates a valid test webhook signature for automated tests.
   */
  public generateTestWebhookSignature(rawBody: string): string {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Test webhook signatures are available only in the test runtime.");
    }
    const secret = this.webhookSecret || "test_secret_for_local_verification";
    return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  }
}

export const razorpayService = new RazorpayService();
