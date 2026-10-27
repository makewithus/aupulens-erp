import { afterEach, describe, expect, it, vi } from "vitest";

describe("buildTenantUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("builds tenant domains from the root domain when the app base is a separate erp host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "https://erp.aupulens.com");
    vi.stubEnv("NEXT_PUBLIC_APP_ROOT_DOMAIN", "aupulens.online");
    vi.resetModules();

    const { buildTenantUrl } = await import("@/lib/config");
    expect(buildTenantUrl("acme")).toBe("https://acme.aupulens.online");
  });

  it("preserves the local port and adds a tenant localhost subdomain", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "http://localhost:3018");
    vi.stubEnv("NEXT_PUBLIC_APP_ROOT_DOMAIN", "aupulens.online");
    vi.resetModules();

    const { buildTenantUrl } = await import("@/lib/config");
    expect(buildTenantUrl("acme")).toBe("http://acme.localhost:3018");
  });
});
