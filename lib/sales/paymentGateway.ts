// No payment-gateway integration (Razorpay/Stripe/etc.) exists anywhere in
// this codebase — subscriptions' "autocharge" concept has nothing real to
// call. Rather than fake a charge attempt, this is a clean, swappable
// interface: the dunning engine and billing cron call attemptAutocharge()
// and get a real (if always-failing) response, so the retry/final-action
// logic downstream is genuinely exercised end-to-end. Once a gateway is
// integrated, only this file's stub implementation needs to change.
export interface AutochargeResult {
  success: boolean;
  reason: string;
}

export interface PaymentGatewayService {
  attemptAutocharge(invoiceId: string, amount: number): Promise<AutochargeResult>;
}

// TODO: wire a real gateway (Razorpay/Stripe/PayU) once credentials exist.
// Every "autocharge" subscription's payment attempt fails honestly today
// rather than being faked as a success.
class StubPaymentGatewayService implements PaymentGatewayService {
  async attemptAutocharge(invoiceId: string): Promise<AutochargeResult> {
    console.log(`[stub-payment-gateway] autocharge attempted for invoice ${invoiceId} — no gateway configured`);
    return { success: false, reason: "No payment gateway is configured for this tenant yet." };
  }
}

let instance: PaymentGatewayService | null = null;

export function getPaymentGatewayService(): PaymentGatewayService {
  if (!instance) instance = new StubPaymentGatewayService();
  return instance;
}
