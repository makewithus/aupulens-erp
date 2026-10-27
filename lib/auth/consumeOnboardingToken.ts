import crypto from "node:crypto";
import User from "@/models/auth/User";

/** Consume an onboarding credential atomically so concurrent replays fail. */
export async function consumeOnboardingToken(userId: string, tenantId: string, token: unknown): Promise<boolean> {
  if (!userId || !tenantId || typeof token !== "string" || !/^autologin_[a-zA-Z0-9]{20,64}$/.test(token)) return false;
  const tempTokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const consumed = await User.findOneAndUpdate(
    {
      _id: userId,
      tenantId,
      status: "active",
      $or: [
        { tempTokenHash, tempTokenExpiry: { $gt: new Date() } },
        { tempToken: token, tempTokenExpiry: { $gt: new Date() } },
      ],
    },
    { $unset: { tempToken: "", tempTokenHash: "", tempTokenExpiry: "" } },
    { new: false },
  ).select("_id").lean();
  return Boolean(consumed);
}
