import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_alerts";

import PlatformAlert from "@/models/platform/PlatformAlert";
import { PLATFORM_ALERT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";

let emitPlatformAlert: typeof import("@/lib/platform/alerts/emit").emitPlatformAlert;
let checkAiUsageThresholdCrossing: typeof import("@/lib/platform/ai/limitBehavior").checkAiUsageThresholdCrossing;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await PlatformAlert.init();
  ({ emitPlatformAlert } = await import("@/lib/platform/alerts/emit"));
  ({ checkAiUsageThresholdCrossing } = await import("@/lib/platform/ai/limitBehavior"));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe("emitPlatformAlert — in-app delivery is real; email/webhook are never fabricated", () => {
  afterEach(async () => {
    await PlatformAlert.deleteMany({});
  });

  it("creates a real alert row with in-app delivery only", async () => {
    await emitPlatformAlert({
      alertType: PLATFORM_ALERT_TYPE.ORGANIZATION_SUSPENDED,
      severity: PLATFORM_SEVERITY.WARNING,
      message: "test alert",
    });
    const alert = await PlatformAlert.findOne({});
    expect(alert).not.toBeNull();
    expect(alert!.deliveryChannels).toEqual(["in_app"]);
    expect(alert!.emailSent).toBe(false);
    expect(alert!.webhookSent).toBe(false);
  });

  it("never throws back to the caller on a DB failure", async () => {
    await expect(
      emitPlatformAlert({
        alertType: "not-a-real-type" as any,
        severity: PLATFORM_SEVERITY.INFO,
        message: "test",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("checkAiUsageThresholdCrossing — fires exactly once per threshold boundary crossed", () => {
  afterEach(async () => {
    await PlatformAlert.deleteMany({});
  });

  it("fires an alert when a call crosses the 50% threshold", async () => {
    // 49 -> 50 out of 100 crosses the 50% boundary.
    await checkAiUsageThresholdCrossing("acme", 49, 50, 100);
    const alerts = await PlatformAlert.find({ tenantId: "acme" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].metadata?.threshold).toBe(50);
  });

  it("does not fire when staying within the same band", async () => {
    // 51 -> 52 out of 100 crosses nothing new.
    await checkAiUsageThresholdCrossing("acme", 51, 52, 100);
    const alerts = await PlatformAlert.find({ tenantId: "acme" });
    expect(alerts).toHaveLength(0);
  });

  it("fires once per threshold when a single call jumps past multiple boundaries", async () => {
    // 40 -> 95 out of 100 crosses 50, 75, and 90.
    await checkAiUsageThresholdCrossing("acme", 40, 95, 100);
    const alerts = await PlatformAlert.find({ tenantId: "acme" });
    expect(alerts).toHaveLength(3);
    const thresholds = alerts.map((a) => a.metadata?.threshold).sort();
    expect(thresholds).toEqual([50, 75, 90]);
  });

  it("does nothing when cap is 0 (avoids a division by zero)", async () => {
    await expect(checkAiUsageThresholdCrossing("acme", 0, 1, 0)).resolves.toBeUndefined();
    expect(await PlatformAlert.countDocuments({})).toBe(0);
  });
});

describe("source-grep: emailSent is never set true anywhere; webhookSent only inside its one real delivery module", () => {
  const ROOT = path.resolve(__dirname, "../..");
  // Phase 12 Part 0.2 (source doc §28): webhook delivery is real now — HTTP
  // POST needs no credentials this environment lacks, unlike email (SMTP).
  // This is the one file allowed to set webhookSent: true, since it's the
  // single place that performs (and honestly records the outcome of) actual
  // delivery. Every other file is still held to "never fabricate a send."
  const WEBHOOK_DELIVERY_FILE = path.join(ROOT, "lib", "platform", "alerts", "webhookDelivery.ts");

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) out.push(...walk(full));
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("no file sets emailSent to true — no platform-level email send infrastructure exists yet", () => {
    const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "models"))];
    const violationPattern = /emailSent\s*:\s*true|\.emailSent\s*=\s*true/;
    const violations = files.filter((f) => violationPattern.test(readFileSync(f, "utf8")));
    expect(violations.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("no file other than webhookDelivery.ts sets webhookSent to true", () => {
    const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "models"))].filter(
      (f) => f !== WEBHOOK_DELIVERY_FILE,
    );
    const violationPattern = /webhookSent\s*:\s*true|\.webhookSent\s*=\s*true/;
    const violations = files.filter((f) => violationPattern.test(readFileSync(f, "utf8")));
    expect(violations.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
