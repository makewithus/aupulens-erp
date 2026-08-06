import bcrypt from "bcryptjs";
import crypto from "crypto";
import connectDB from "@/lib/db";
import User, { type IUser } from "@/models/User";
import Organization from "@/models/Organization";
import OrgInvite from "@/models/OrgInvite";
import { ENTITY_STATUS, INVITE_STATUS } from "@/lib/constants/statuses";
import { getTierLimits } from "@/lib/constants/tiers";
import { getTenantFromHost } from "@/lib/tenant/resolution";

// Injected dependency — allows tests to supply a fake hostname without touching
// next/headers or the live request.  In production auth.ts passes a closure
// over `headers()` from next/headers.
export type HostnameFetcher = () => Promise<string>;

// Returns true to allow sign-in, or a redirect string to deny with a reason.
// Called only for OAuth providers (account.type === "oauth").
// For credentials, returns true immediately so the existing authorize() handles it.
//
// TENANT RESOLUTION: The tenantId is extracted from the request hostname using
// the same getTenantFromHost() function that middleware uses — one parser, no divergence.
// The signIn callback runs in the App Router route-handler context
// (app/api/auth/[...nextauth]/route.ts), so next/headers is accessible.
//
// USER OBJECT MUTATION: Mutates `user.id`, `user.role`, `user.tenantId` in-place.
// NextAuth (JWT strategy, no adapter) passes the same object reference to the jwt
// callback, so these mutations are stamped onto the token without any jwt-callback
// changes — the existing claim shape { id, role, tenantId } is preserved exactly.
export async function resolveOAuthSignIn(
  user: any,
  account: any,
  getHostname: HostnameFetcher
): Promise<boolean | string> {
  // Credentials provider is handled by CredentialsProvider.authorize() — pass through.
  if (account?.type !== "oauth") return true;

  const hostname = await getHostname();
  const tenantId = getTenantFromHost(hostname);

  // Apex / no-subdomain login: cannot determine which workspace the user belongs to.
  // Org-selection UI is deferred — route to the error page with a descriptive code.
  if (!tenantId) {
    return "/auth/admin?error=OAuthNoTenant";
  }

  const email = (user.email ?? "").toLowerCase();
  if (!email) {
    return "/auth/admin?error=OAuthNoEmail";
  }

  await connectDB();

  // ── Case 1: User already exists in this tenant ────────────────────────────
  const dbUser = await User.findOne({ tenantId, email }).lean<IUser>();

  if (dbUser) {
    if (dbUser.status !== ENTITY_STATUS.ACTIVE) {
      return "/auth/admin?error=OAuthAccountDeactivated";
    }

    const org = await Organization.findOne({ subdomain: tenantId }).lean<{
      isActive?: boolean;
    }>();
    if (org && org.isActive === false) {
      return "/auth/admin?error=OAuthOrgSuspended";
    }

    // Record this OAuth provider on the user — idempotent via $addToSet.
    await User.updateOne(
      { _id: (dbUser as any)._id },
      {
        $addToSet: {
          oauthProviders: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
      }
    );

    // Stamp the user object so the jwt callback sees the right claims.
    // (Same shape as what CredentialsProvider.authorize() returns.)
    user.id = String((dbUser as any)._id);
    user.role = dbUser.role;
    user.tenantId = dbUser.tenantId;
    user.permissions = (dbUser as any).permissions;

    return true;
  }

  // ── Case 2: No existing user — check for a valid pending invite ───────────
  // No silent user creation: an OAuth identity alone is NOT enough to join a
  // workspace.  A workspace admin must have issued an invite for this email first.
  const invite = await OrgInvite.findOne({
    tenantId,
    email,
    status: INVITE_STATUS.PENDING,
  }).lean<{
    _id: any;
    role: string;
    expiresAt: Date;
    tenantId: string;
  }>();

  if (!invite || invite.expiresAt < new Date()) {
    return "/auth/admin?error=OAuthNoAccount";
  }

  // Valid invite — complete the invite-accept flow and sign in.
  const org = await Organization.findOne({ subdomain: tenantId }).lean<{
    isActive?: boolean;
    tier?: string;
  }>();

  if (!org) return "/auth/admin?error=OAuthOrgNotFound";

  if (org.isActive === false) {
    return "/auth/admin?error=OAuthOrgSuspended";
  }

  const { maxUsers } = getTierLimits(org.tier);
  const memberCount = await User.countDocuments({ tenantId });
  if (memberCount >= maxUsers) {
    return "/auth/admin?error=OAuthSeatCapReached";
  }

  // Create the new user in the target tenant (invite-gated — not open registration).
  // Phone and password are required schema fields: phone gets a placeholder and password
  // gets a cryptographically random value that cannot be brute-forced.  The user
  // will always authenticate via OAuth going forward.
  const name = (user.name as string | undefined) || email.split("@")[0] || "User";
  const randomPassword = await bcrypt.hash(
    crypto.randomBytes(32).toString("hex"),
    12
  );

  const newUser = await User.create({
    name,
    email,
    phone: "0000000000",
    password: randomPassword,
    role: invite.role,
    status: ENTITY_STATUS.ACTIVE,
    tenantId,
    oauthProviders: [
      { provider: account.provider, providerAccountId: account.providerAccountId },
    ],
  });

  await OrgInvite.updateOne(
    { _id: invite._id },
    { $set: { status: INVITE_STATUS.ACCEPTED } }
  );

  // Stamp user for the jwt callback.
  user.id = String(newUser._id);
  user.role = invite.role;
  user.tenantId = tenantId;
  user.permissions = newUser.permissions;

  return true;
}
