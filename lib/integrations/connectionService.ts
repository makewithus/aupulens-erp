/**
 * Connection service — the server-side lifecycle for Aupulens Connect.
 *
 * Handles credential encryption (secret fields via lib/crypto AES-256-GCM),
 * decryption for use, the "Test connection" reachability probe, and writing
 * IntegrationEvent rows for the health dashboard. All functions are tenant-aware
 * — callers pass the resolved tenantId from the session; nothing here trusts a
 * client-supplied tenant.
 */

import crypto from "node:crypto";
import Integration, { INTEGRATION_STATUS, type IIntegration } from "@/models/shared/Integration";
import IntegrationEvent, {
  INTEGRATION_EVENT_DIRECTION,
  INTEGRATION_EVENT_STATUS,
} from "@/models/shared/IntegrationEvent";
import { getConnector, type Connector } from "@/lib/integrations/registry";
import { encrypt, decrypt } from "@/lib/crypto";

/** Encrypt secret credential fields; keep non-secret ones as plain strings. */
export function encryptCredentials(
  connector: Connector,
  input: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of connector.credentials) {
    const val = input[field.key];
    if (val === undefined || val === "") continue;
    out[field.key] = field.secret ? encrypt(val) : val;
  }
  return out;
}

/** Decrypt secret fields back to usable plaintext (server-only). */
export function decryptCredentials(
  connector: Connector,
  stored: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of connector.credentials) {
    const val = stored[field.key];
    if (val === undefined) continue;
    out[field.key] = field.secret ? safeDecrypt(val) : val;
  }
  return out;
}

function safeDecrypt(v: string): string {
  try {
    return decrypt(v);
  } catch {
    return "";
  }
}

/**
 * Client-safe view of a connection: which credential fields are set (booleans),
 * never the values. The inbound webhook URL is included so the user can paste it
 * into the provider's dashboard.
 */
export function toClientView(job: IIntegration, baseUrl: string) {
  const connector = getConnector(job.connectorId);
  const credentialsSet: Record<string, boolean> = {};
  for (const f of connector?.credentials ?? []) {
    credentialsSet[f.key] = !!(job.credentials as Record<string, string>)[f.key];
  }
  return {
    _id: job._id,
    connectorId: job.connectorId,
    connectorName: connector?.name ?? job.connectorId,
    name: job.name,
    status: job.status,
    enabled: job.enabled,
    credentialsSet,
    hasWebhook: !!connector?.webhook,
    webhookUrl: connector?.webhook
      ? `${baseUrl}/api/public/integrations/webhooks/${job._id}/${job.webhookToken}`
      : null,
    lastTestAt: job.lastTestAt,
    lastEventAt: job.lastEventAt,
    lastError: job.lastError,
    createdAt: job.createdAt,
  };
}

export function newWebhookToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function logEvent(params: {
  tenantId: string;
  integrationId: unknown;
  connectorId: string;
  direction: (typeof INTEGRATION_EVENT_DIRECTION)[keyof typeof INTEGRATION_EVENT_DIRECTION];
  eventType: string;
  status: (typeof INTEGRATION_EVENT_STATUS)[keyof typeof INTEGRATION_EVENT_STATUS];
  message?: string;
  payloadDigest?: string;
}) {
  await IntegrationEvent.create(params);
}

export interface TestResult {
  ok: boolean;
  message: string;
}

/**
 * Test a connection. When the connector defines a real reachability probe and
 * the required credentials are present, this makes an actual authenticated GET
 * and reports the provider's response. When credentials are missing or the
 * connector has no probe (e.g. webhook-only), it reports honestly rather than
 * faking success. Records a `test` IntegrationEvent either way.
 */
export async function testConnection(job: IIntegration): Promise<TestResult> {
  const connector = getConnector(job.connectorId);
  let result: TestResult;

  if (!connector) {
    result = { ok: false, message: "Unknown connector." };
  } else if (!connector.testEndpoint) {
    // Webhook-only / send-only connectors: nothing to probe. "Valid" once the
    // signing secret / URL is present.
    const needed = connector.credentials.filter((c) => c.secret);
    const missing = needed.filter((c) => !(job.credentials as Record<string, string>)[c.key]);
    result =
      missing.length === 0
        ? { ok: true, message: "Credentials stored. This connector is inbound/outbound-only — no live probe available; verify by sending a test event." }
        : { ok: false, message: `Missing: ${missing.map((m) => m.label).join(", ")}.` };
  } else {
    const creds = decryptCredentials(connector, job.credentials as Record<string, string>);
    const authHeader = connector.testEndpoint.authHeader?.(creds);
    if (!authHeader) {
      result = { ok: false, message: "Required credentials are not set." };
    } else {
      try {
        const res = await fetch(connector.testEndpoint.url, {
          method: connector.testEndpoint.method,
          headers: { Authorization: authHeader },
          // Bound the probe so a hung provider can't stall the request.
          signal: AbortSignal.timeout(8000),
        });
        result = res.ok
          ? { ok: true, message: `Connected — provider responded ${res.status}.` }
          : { ok: false, message: `Provider rejected credentials (HTTP ${res.status}).` };
      } catch (err) {
        result = { ok: false, message: err instanceof Error ? `Probe failed: ${err.message}` : "Probe failed." };
      }
    }
  }

  job.status = result.ok ? INTEGRATION_STATUS.CONNECTED : INTEGRATION_STATUS.ERROR;
  job.lastTestAt = new Date();
  job.lastError = result.ok ? undefined : result.message;
  await job.save();

  await logEvent({
    tenantId: job.tenantId,
    integrationId: job._id,
    connectorId: job.connectorId,
    direction: INTEGRATION_EVENT_DIRECTION.TEST,
    eventType: "connection.test",
    status: result.ok ? INTEGRATION_EVENT_STATUS.SUCCESS : INTEGRATION_EVENT_STATUS.FAILED,
    message: result.message,
  });

  return result;
}

/** Resolve the decrypted signing secret for inbound webhook verification. */
export function resolveWebhookSecret(job: IIntegration): string | null {
  const connector = getConnector(job.connectorId);
  if (!connector?.webhook) return null;
  const stored = (job.credentials as Record<string, string>)[connector.webhook.secretField];
  if (!stored) return null;
  return safeDecrypt(stored);
}
