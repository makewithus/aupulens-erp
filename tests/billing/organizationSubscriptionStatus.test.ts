import { describe, expect, it } from "vitest";
import Organization from "@/models/admin/Organization";
import { SUBSCRIPTION_STATUS } from "@/lib/constants/statuses";

describe("organization subscription status schema", () => {
  it("accepts expired when the cancellation sweep expires a subscription", () => {
    const statusPath = Organization.schema.path("subscriptionStatus") as any;
    expect(statusPath.enumValues).toContain(SUBSCRIPTION_STATUS.EXPIRED);
  });
});
