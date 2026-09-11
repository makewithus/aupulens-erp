import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_authflow";
process.env.ADMIN_SESSION_SECRET = "c".repeat(40);
process.env.ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

import AdminUser from "@/models/platform/AdminUser";
import AdminSession from "@/models/platform/AdminSession";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { ADMIN_ROLE, ADMIN_USER_STATUS, PLATFORM_EVENT_TYPE } from "@/lib/constants/statuses";
import { generateTotpCode } from "@/lib/platform/auth/totp";
import { decrypt } from "@/lib/crypto";
import { makeRequest, makeRequestWithCookie } from "./_helpers/routeTestUtils";

let loginPOST: typeof import("@/app/api/platform/auth/login/route").POST;
let mfaSetupPOST: typeof import("@/app/api/platform/auth/mfa/setup/route").POST;
let mfaVerifyPOST: typeof import("@/app/api/platform/auth/mfa/verify/route").POST;
let logoutPOST: typeof import("@/app/api/platform/auth/logout/route").POST;
let meGET: typeof import("@/app/api/platform/me/route").GET;

const EMAIL = "flow-admin@example.com";
const PASSWORD = "correct horse battery staple 42";

function cookieFromResponse(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

describe("Global Admin auth flow — login -> MFA enrollment -> session -> logout -> revoked", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AdminUser.init();
    await AdminSession.init();
    await PlatformAuditLog.init();

    ({ POST: loginPOST } = await import("@/app/api/platform/auth/login/route"));
    ({ POST: mfaSetupPOST } = await import("@/app/api/platform/auth/mfa/setup/route"));
    ({ POST: mfaVerifyPOST } = await import("@/app/api/platform/auth/mfa/verify/route"));
    ({ POST: logoutPOST } = await import("@/app/api/platform/auth/logout/route"));
    ({ GET: meGET } = await import("@/app/api/platform/me/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AdminUser.deleteMany({});
    await AdminSession.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  });

  it("rejects a wrong password and audits the failure", async () => {
    await AdminUser.create({
      name: "Flow Admin",
      email: EMAIL,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      status: ADMIN_USER_STATUS.ACTIVE,
      mfaEnabled: false,
    });

    const res = await loginPOST(
      makeRequest("http://localhost/api/platform/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: EMAIL, password: "wrong password" }),
      }),
    );
    expect(res.status).toBe(401);

    const logs = await PlatformAuditLog.find({ eventType: PLATFORM_EVENT_TYPE.LOGIN_FAILED });
    expect(logs).toHaveLength(1);
  });

  it("full first-login flow: password -> MFA setup -> confirm -> session cookie -> /me -> logout -> cookie now rejected", async () => {
    await AdminUser.create({
      name: "Flow Admin",
      email: EMAIL,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      status: ADMIN_USER_STATUS.ACTIVE,
      mfaEnabled: false,
    });

    // 1. password login -> mfaSetupRequired
    const loginRes = await loginPOST(
      makeRequest("http://localhost/api/platform/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      }),
    );
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.data.mfaSetupRequired).toBe(true);
    const challengeToken = loginBody.data.challengeToken;

    // 2. start MFA enrollment -> get secret
    const setupRes = await mfaSetupPOST(
      makeRequest("http://localhost/api/platform/auth/mfa/setup", {
        method: "POST",
        body: JSON.stringify({ challengeToken }),
      }),
    );
    expect(setupRes.status).toBe(200);
    const setupBody = await setupRes.json();
    const secret = setupBody.data.secret;
    expect(setupBody.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    // secret must be stored encrypted, not plaintext
    const stored = await AdminUser.findOne({ email: EMAIL });
    expect(stored!.mfaSecretEncrypted).not.toBe(secret);
    expect(decrypt(stored!.mfaSecretEncrypted!)).toBe(secret);
    expect(stored!.mfaEnabled).toBe(false);

    // 3. wrong code rejected
    const wrongRes = await mfaVerifyPOST(
      makeRequest("http://localhost/api/platform/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code: "000000" }),
      }),
    );
    expect(wrongRes.status).toBe(401);

    // 4. correct code confirms enrollment and issues a session
    const code = generateTotpCode(secret);
    const verifyRes = await mfaVerifyPOST(
      makeRequest("http://localhost/api/platform/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code }),
      }),
    );
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.data.backupCodes).toHaveLength(10);
    const cookie = cookieFromResponse(verifyRes);
    expect(cookie).toContain("aupulens_admin_session=");

    const enrolledAdmin = await AdminUser.findOne({ email: EMAIL });
    expect(enrolledAdmin!.mfaEnabled).toBe(true);
    expect(enrolledAdmin!.mfaBackupCodeHashes).toHaveLength(10);

    // 5. session cookie works against /me
    const meRes = await meGET(makeRequestWithCookie("http://localhost/api/platform/me", cookie));
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.data.email).toBe(EMAIL);

    // 6. logout revokes the session
    const logoutRes = await logoutPOST(
      makeRequestWithCookie("http://localhost/api/platform/auth/logout", cookie, { method: "POST" }),
    );
    expect(logoutRes.status).toBe(200);

    // 7. the same (now-revoked) cookie no longer works
    const meAfterLogout = await meGET(makeRequestWithCookie("http://localhost/api/platform/me", cookie));
    expect(meAfterLogout.status).toBe(401);

    const successLogs = await PlatformAuditLog.find({ eventType: PLATFORM_EVENT_TYPE.LOGIN_SUCCESS });
    expect(successLogs).toHaveLength(1);
    const logoutLogs = await PlatformAuditLog.find({ eventType: PLATFORM_EVENT_TYPE.LOGOUT });
    expect(logoutLogs).toHaveLength(1);
  });

  it("returning admin (already enrolled) logs in with a plain TOTP code, no setup step", async () => {
    const secret = "JBSWY3DPEHPK3PXP"; // fixed test secret
    await AdminUser.create({
      name: "Returning Admin",
      email: "returning@example.com",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: ADMIN_ROLE.SUPPORT_ADMIN,
      status: ADMIN_USER_STATUS.ACTIVE,
      mfaEnabled: true,
      mfaSecretEncrypted: (await import("@/lib/crypto")).encrypt(secret),
    });

    const loginRes = await loginPOST(
      makeRequest("http://localhost/api/platform/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "returning@example.com", password: PASSWORD }),
      }),
    );
    const loginBody = await loginRes.json();
    expect(loginBody.data.mfaRequired).toBe(true);

    const code = generateTotpCode(secret);
    const verifyRes = await mfaVerifyPOST(
      makeRequest("http://localhost/api/platform/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken: loginBody.data.challengeToken, code }),
      }),
    );
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.data.backupCodes).toBeUndefined(); // no fresh backup codes on ordinary login
  });

  it("locks the account after 5 failed password attempts", async () => {
    await AdminUser.create({
      name: "Lockout Admin",
      email: "lockout@example.com",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      status: ADMIN_USER_STATUS.ACTIVE,
      mfaEnabled: false,
    });

    for (let i = 0; i < 5; i++) {
      await loginPOST(
        makeRequest("http://localhost/api/platform/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: "lockout@example.com", password: "wrong" }),
        }),
      );
    }

    const finalAttempt = await loginPOST(
      makeRequest("http://localhost/api/platform/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "lockout@example.com", password: PASSWORD }),
      }),
    );
    expect(finalAttempt.status).toBe(423);
  });
});
