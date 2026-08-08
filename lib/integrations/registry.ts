/**
 * Aupulens Connect — connector catalog (vNext Expansion Module 2, iPaaS).
 *
 * Pure, client-safe metadata: no DB, no crypto, no secrets. Describes each
 * available connector — how it authenticates, which credentials it needs, how
 * to verify its inbound webhooks, and what it can do. The connection service
 * and UI both read from here so "what connectors exist" has one source.
 *
 * NOTE ON OUTBOUND CALLS: making real Razorpay/Stripe/etc API calls requires
 * live credentials that don't exist in this environment. Following the house
 * pattern (gspService/paymentGateway stubs), a connector's `testEndpoint` is a
 * real reachability probe used by the "Test connection" action — honest about
 * whether credentials are present rather than faking a green check. Inbound
 * webhook verification, by contrast, is fully real and unit-tested.
 */

export type AuthType = "api_key" | "oauth2" | "hmac_secret" | "webhook_only";

export type SignatureScheme =
  | "hmac_sha256_hex" // sig = hex(HMAC-SHA256(body, secret))  — Razorpay, generic
  | "hmac_sha256_base64" // sig = base64(HMAC-SHA256(body, secret)) — Shopify
  | "github_sha256" // header value "sha256=" + hex(HMAC-SHA256(body, secret)) — Meta/WhatsApp
  | "stripe"; // "t=<ts>,v1=<hex>", signed payload = `${ts}.${body}`

export interface CredentialField {
  key: string;
  label: string;
  /** secret fields are encrypted at rest and never returned to the client. */
  secret: boolean;
  placeholder?: string;
}

export interface WebhookSpec {
  /** HTTP header carrying the signature on inbound webhooks. */
  header: string;
  scheme: SignatureScheme;
  /** Which stored credential field holds the signing secret. */
  secretField: string;
}

export interface Connector {
  id: string;
  name: string;
  category: "finance" | "communication" | "commerce" | "logistics" | "productivity" | "custom";
  blurb: string;
  authType: AuthType;
  credentials: CredentialField[];
  /** Present when the connector accepts inbound webhooks. */
  webhook?: WebhookSpec;
  capabilities: string[];
  /** Optional real reachability probe for "Test connection". */
  testEndpoint?: { url: string; method: "GET"; authHeader?: (creds: Record<string, string>) => string };
  docsUrl?: string;
}

const CONNECTORS: Connector[] = [
  {
    id: "razorpay",
    name: "Razorpay",
    category: "finance",
    blurb: "Accept payments and reconcile settlements. Ingests payment.captured / order.paid webhooks.",
    authType: "api_key",
    credentials: [
      { key: "keyId", label: "Key ID", secret: false, placeholder: "rzp_live_..." },
      { key: "keySecret", label: "Key Secret", secret: true },
      { key: "webhookSecret", label: "Webhook Secret", secret: true },
    ],
    webhook: { header: "x-razorpay-signature", scheme: "hmac_sha256_hex", secretField: "webhookSecret" },
    capabilities: ["payments.read", "webhooks.inbound"],
    testEndpoint: {
      url: "https://api.razorpay.com/v1/payments?count=1",
      method: "GET",
      authHeader: (c) => "Basic " + Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64"),
    },
    docsUrl: "https://razorpay.com/docs/webhooks/",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "finance",
    blurb: "Global card payments and subscriptions. Ingests signed Stripe events.",
    authType: "api_key",
    credentials: [
      { key: "secretKey", label: "Secret Key", secret: true, placeholder: "sk_live_..." },
      { key: "webhookSecret", label: "Webhook Signing Secret", secret: true, placeholder: "whsec_..." },
    ],
    webhook: { header: "stripe-signature", scheme: "stripe", secretField: "webhookSecret" },
    capabilities: ["payments.read", "webhooks.inbound"],
    testEndpoint: {
      url: "https://api.stripe.com/v1/balance",
      method: "GET",
      authHeader: (c) => "Bearer " + c.secretKey,
    },
    docsUrl: "https://stripe.com/docs/webhooks",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "communication",
    blurb: "Send templated messages and receive delivery/read + inbound-message events.",
    authType: "api_key",
    credentials: [
      { key: "accessToken", label: "Access Token", secret: true },
      { key: "phoneNumberId", label: "Phone Number ID", secret: false },
      { key: "appSecret", label: "App Secret", secret: true },
    ],
    webhook: { header: "x-hub-signature-256", scheme: "github_sha256", secretField: "appSecret" },
    capabilities: ["messages.send", "webhooks.inbound"],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks",
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "commerce",
    blurb: "Sync orders and products. Ingests orders/create, products/update webhooks.",
    authType: "api_key",
    credentials: [
      { key: "shopDomain", label: "Shop Domain", secret: false, placeholder: "mystore.myshopify.com" },
      { key: "adminApiToken", label: "Admin API Access Token", secret: true },
      { key: "webhookSecret", label: "Webhook Signing Secret", secret: true },
    ],
    webhook: { header: "x-shopify-hmac-sha256", scheme: "hmac_sha256_base64", secretField: "webhookSecret" },
    capabilities: ["orders.read", "products.read", "webhooks.inbound"],
    docsUrl: "https://shopify.dev/docs/apps/webhooks",
  },
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    blurb: "Post ERP notifications to channels via an incoming webhook URL.",
    authType: "webhook_only",
    credentials: [{ key: "incomingWebhookUrl", label: "Incoming Webhook URL", secret: true, placeholder: "https://hooks.slack.com/services/..." }],
    capabilities: ["messages.send"],
    docsUrl: "https://api.slack.com/messaging/webhooks",
  },
  {
    id: "generic_webhook",
    name: "Generic Webhook",
    category: "custom",
    blurb: "Receive events from any system that can HMAC-sign its payload (X-Aupulens-Signature, SHA-256 hex).",
    authType: "hmac_secret",
    credentials: [{ key: "signingSecret", label: "Signing Secret", secret: true }],
    webhook: { header: "x-aupulens-signature", scheme: "hmac_sha256_hex", secretField: "signingSecret" },
    capabilities: ["webhooks.inbound"],
  },
];

const BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]));

export function listConnectors(): Connector[] {
  return CONNECTORS;
}

export function getConnector(id: string): Connector | null {
  return BY_ID.get(id) ?? null;
}

/** Client-safe view: strips nothing structural, but callers must never send
 *  stored secret VALUES to the client — the catalog itself has no values. */
export function connectorCatalog() {
  return CONNECTORS.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    blurb: c.blurb,
    authType: c.authType,
    credentials: c.credentials,
    hasWebhook: !!c.webhook,
    capabilities: c.capabilities,
    docsUrl: c.docsUrl,
  }));
}
