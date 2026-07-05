// Clean-interface wrapper around the external payment-gateway network calls
// (Razorpay/PayPal/Stripe-style "connect an account" handshakes), mirroring the
// GspService pattern in lib/einvoice/gspService.ts and the GstinLookup pattern
// in lib/sales/gstinLookup.ts. The internal flow (DB row, status tracking, UI)
// is real end-to-end; only the external gateway API calls are stubbed, since
// this environment never receives real gateway API keys/secrets.
// TODO: replace the stubbed methods below with real HTTP calls once each
// gateway's API keys, webhook secret, and merchant/account ID are available.
// Nothing outside this file should know the integration is stubbed — callers
// only depend on PaymentGatewayService.

export interface PaymentGatewayCredentialsInput {
  [key: string]: any; // e.g. { apiKey, apiSecret } — real integration also needs a webhook secret per gateway
}

export interface PaymentGatewayResult {
  ok: boolean;
  status?: "connected" | "disconnected";
  error?: string;
}

export interface PaymentGatewayService {
  connect(
    tenantId: string,
    provider: string,
    credentials: PaymentGatewayCredentialsInput,
  ): Promise<PaymentGatewayResult>;
  disconnect(tenantId: string, provider: string): Promise<PaymentGatewayResult>;
  getStatus(tenantId: string, provider: string): Promise<PaymentGatewayResult>;
}

// TODO: replace with real per-gateway API clients (Razorpay SDK, PayPal SDK,
// Stripe SDK, ...) once credentials are available. A real implementation would
// also need to: validate credentials against the gateway's auth endpoint,
// register/verify a webhook URL + secret, and store a gateway-issued
// account/merchant ID alongside the credentials.
class StubPaymentGatewayService implements PaymentGatewayService {
  async connect(
    _tenantId: string,
    _provider: string,
    credentials: PaymentGatewayCredentialsInput,
  ): Promise<PaymentGatewayResult> {
    if (!credentials || Object.values(credentials).every((v) => !v)) {
      return { ok: false, error: "Credentials are required to connect" };
    }
    // Stub: accept any non-empty credentials as valid in the absence of real
    // gateway API access. A real implementation would call the gateway's
    // "verify API key" endpoint here before flipping status.
    return { ok: true, status: "connected" };
  }

  async disconnect(_tenantId: string, _provider: string): Promise<PaymentGatewayResult> {
    // Stub: a real implementation would also revoke the webhook registration
    // and any stored access/refresh tokens on the gateway's side.
    return { ok: true, status: "disconnected" };
  }

  async getStatus(_tenantId: string, _provider: string): Promise<PaymentGatewayResult> {
    // Stub: status is read straight from our own DB row by the caller; a real
    // implementation might also ping the gateway's health/status endpoint.
    return { ok: true };
  }
}

let paymentGatewayService: PaymentGatewayService = new StubPaymentGatewayService();

export function getPaymentGatewayService(): PaymentGatewayService {
  return paymentGatewayService;
}

// Test-only override hook.
export function setPaymentGatewayService(service: PaymentGatewayService) {
  paymentGatewayService = service;
}
