/**
 * Central place for environment-driven URLs. Nothing outside this file should
 * hardcode a scheme+host for our own app — subdomain links, redirects, and
 * support addresses all derive from these.
 *
 * Same-origin API calls from the browser should stay relative (e.g.
 * fetch("/api/..."))  — that works in every environment by construction and
 * needs no entry here.
 */

/** Root marketing/tenant domain, e.g. "aupulens.online". Tenants live at `${subdomain}.${APP_ROOT_DOMAIN}`. */
export const APP_ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_APP_ROOT_DOMAIN || "aupulens.online";

/** Base URL of the marketing/default-tenant site, for redirects and links. */
export const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_BASE_URL || `https://${APP_ROOT_DOMAIN}`;

/** Support inbox shown in suspended/error states. */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || `support@${APP_ROOT_DOMAIN}`;

/**
 * Absolute origin for cases that must cross origins: the packaged Electron
 * shell, server-side scripts, and tests hitting a live server. Browser code
 * making same-origin API calls should use relative paths instead.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/** Builds the public URL for a tenant's workspace, e.g. buildTenantUrl("acme") -> "https://acme.aupulens.online". */
export function buildTenantUrl(subdomain: string): string {
  return `https://${subdomain}.${APP_ROOT_DOMAIN}`;
}
