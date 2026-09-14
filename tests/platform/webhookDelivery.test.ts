import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_webhook_delivery";

import PlatformAlert from "@/models/platform/PlatformAlert";
import PlatformWebhookConfig from "@/models/platform/PlatformWebhookConfig";
import { PLATFORM_ALERT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";

let deliverWebhookForAlert: typeof import("@/lib/platform/alerts/webhookDelivery").deliverWebhookForAlert;
let emitPlatformAlert: typeof import("@/lib/platform/alerts/emit").emitPlatformAlert;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await PlatformAlert.init();
  await PlatformWebhookConfig.init();
  ({ deliverWebhookForAlert } = await import("@/lib/platform/alerts/webhookDelivery"));
  ({ emitPlatformAlert } = await import("@/lib/platform/alerts/emit"));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await PlatformAlert.deleteMany({});
  await PlatformWebhookConfig.deleteMany({});
  vi.unstubAllGlobals();
});

describe("deliverWebhookForAlert — real HTTP delivery, honest failure recording, never throws", () => {
  it("no-ops when no config exists for the alert's type", async () => {
    const alert = await PlatformAlert.create({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      severity: PLATFORM_SEVERITY.WARNING,
      message: "test",
      deliveryChannels: ["in_app"],
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await deliverWebhookForAlert(String(alert._id));
    expect(fetchSpy).not.toHaveBeenCalled();
    const reloaded = await PlatformAlert.findById(alert._id);
    expect(reloaded!.webhookSent).toBe(false);
  });

  it("no-ops when a config exists but is disabled", async () => {
    const alert = await PlatformAlert.create({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      severity: PLATFORM_SEVERITY.WARNING,
      message: "test",
      deliveryChannels: ["in_app"],
    });
    await PlatformWebhookConfig.create({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      url: "https://example.com/hook",
      enabled: false,
      secret: "s3cret",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await deliverWebhookForAlert(String(alert._id));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delivers, signs the payload, and records webhookSent: true on success", async () => {
    const alert = await PlatformAlert.create({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      severity: PLATFORM_SEVERITY.WARNING,
      message: "org suspended",
      tenantId: "acme",
      deliveryChannels: ["in_app", "webhook"],
    });
    await PlatformWebhookConfig.create({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      url: "https://example.com/hook",
      enabled: true,
      secret: "s3cret",
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchSpy);

    await deliverWebhookForAlert(String(alert._id));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(init.headers["X-Aupulens-Signature"]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(init.body)).toMatchObject({ tenantId: "acme", alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED });

    const reloaded = await PlatformAlert.findById(alert._id);
    expect(reloaded!.webhookSent).toBe(true);
  });

  it("retries up to 3 attempts, then records the failure without throwing — webhookSent stays false", async () => {
    const alert = await PlatformAlert.create({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      severity: PLATFORM_SEVERITY.WARNING,
      message: "test",
      deliveryChannels: ["in_app", "webhook"],
    });
    await PlatformWebhookConfig.create({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      url: "https://example.com/hook",
      enabled: true,
      secret: "s3cret",
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(deliverWebhookForAlert(String(alert._id))).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const reloaded = await PlatformAlert.findById(alert._id);
    expect(reloaded!.webhookSent).toBe(false);
    expect(reloaded!.metadata?.webhookDeliveryError).toBe("HTTP 500");
  }, 10000);

  it("never throws even if the alert id does not exist", async () => {
    await expect(deliverWebhookForAlert(new mongoose.Types.ObjectId().toString())).resolves.toBeUndefined();
  });
});

describe("emitPlatformAlert — includes webhook in deliveryChannels only when a config is enabled for that type", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
  });

  it("stays in_app-only when no webhook config exists", async () => {
    await emitPlatformAlert({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      severity: PLATFORM_SEVERITY.WARNING,
      message: "test",
    });
    const alert = await PlatformAlert.findOne({});
    expect(alert!.deliveryChannels).toEqual(["in_app"]);
  });

  it("adds webhook to deliveryChannels when an enabled config exists for that alert type", async () => {
    await PlatformWebhookConfig.create({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      url: "https://example.com/hook",
      enabled: true,
      secret: "s3cret",
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchSpy);

    await emitPlatformAlert({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      severity: PLATFORM_SEVERITY.WARNING,
      message: "test",
    });
    const alert = await PlatformAlert.findOne({});
    expect(alert!.deliveryChannels).toEqual(["in_app", "webhook"]);
  });
});
