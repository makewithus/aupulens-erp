import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Integration from "@/models/shared/Integration";
import { getConnector } from "@/lib/integrations/registry";
import {
  resolveWebhookSecret,
  logEvent,
} from "@/lib/integrations/connectionService";
import { INTEGRATION_EVENT_DIRECTION, INTEGRATION_EVENT_STATUS } from "@/models/shared/IntegrationEvent";
import { verifyWebhookSignature, digestPayload } from "@/lib/integrations/webhookVerify";

/**
 * Inbound webhook receiver for Aupulens Connect.
 *
 * Lives under /api/public/* so external providers (which carry no Aupulens
 * session) are let through by middleware. Security is enforced HERE, in two
 * layers: (1) the unguessable per-connection token in the URL path, and (2) a
 * constant-time HMAC signature check over the RAW body. A request failing either
 * is logged as a failed event and rejected — it never touches business data.
 *
 * The raw body is read with req.text() BEFORE any JSON parsing, because the
 * signature is computed over exact bytes; re-serializing parsed JSON would
 * change whitespace/key-order and break verification.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ connectionId: string; token: string }> },
) {
  const { connectionId, token } = await props.params;

  await dbConnect();
  const job = await Integration.findOne({ _id: connectionId, webhookToken: token }).catch(() => null);
  if (!job) {
    // Ambiguous 404 — don't reveal whether the id or token was wrong.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const connector = getConnector(job.connectorId);
  if (!connector?.webhook) {
    return NextResponse.json({ error: "Connector does not accept webhooks" }, { status: 400 });
  }

  const rawBody = await req.text();
  const digest = digestPayload(rawBody);

  const fail = async (reason: string, code: number) => {
    await logEvent({
      tenantId: job.tenantId,
      integrationId: job._id,
      connectorId: job.connectorId,
      direction: INTEGRATION_EVENT_DIRECTION.INBOUND,
      eventType: "webhook",
      status: INTEGRATION_EVENT_STATUS.FAILED,
      message: reason,
      payloadDigest: digest,
    });
    return NextResponse.json({ error: reason }, { status: code });
  };

  if (!job.enabled) return fail("Connection disabled", 403);

  const secret = resolveWebhookSecret(job);
  if (!secret) return fail("No signing secret configured", 400);

  const header = req.headers.get(connector.webhook.header);
  const verdict = verifyWebhookSignature(connector.webhook.scheme, rawBody, header, secret);
  if (!verdict.valid) return fail(verdict.reason || "Invalid signature", 401);

  // Signature is valid → record a success event. (Routing the verified payload
  // to per-provider handlers — creating a Payment from payment.captured, etc. —
  // is the documented next increment; the secure ingestion boundary is complete.)
  let eventType = "webhook";
  try {
    const parsed = JSON.parse(rawBody);
    eventType = parsed?.event || parsed?.type || parsed?.topic || "webhook";
  } catch {
    /* non-JSON payloads are fine; keep generic type */
  }

  job.lastEventAt = new Date();
  await job.save();

  await logEvent({
    tenantId: job.tenantId,
    integrationId: job._id,
    connectorId: job.connectorId,
    direction: INTEGRATION_EVENT_DIRECTION.INBOUND,
    eventType,
    status: INTEGRATION_EVENT_STATUS.SUCCESS,
    message: "Verified inbound webhook accepted",
    payloadDigest: digest,
  });

  return NextResponse.json({ received: true });
}
