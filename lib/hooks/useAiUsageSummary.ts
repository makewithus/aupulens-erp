"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { AiUsageSummary } from "@/lib/ai/usagePolicy";

export const AI_USAGE_CHANGED = "aupulens:ai-usage-changed";
export function refreshAiUsage() { window.dispatchEvent(new Event(AI_USAGE_CHANGED)); }

/** Shared for multiple composers; coalesces simultaneous invalidations without dropping
 * completions that occur while a summary is already being read. No usage is persisted client-side. */
let pending: Promise<AiUsageSummary> | null = null;
let pendingScope: string | null = null;
let requestSequence = 0;
const latestResponse = new Map<string, { sequence: number; data: AiUsageSummary }>();
function readSummary(scope: string, force = false): Promise<AiUsageSummary> {
  if (!force && pending && pendingScope === scope) return pending;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const sequence = ++requestSequence;
  const request = fetch("/api/ai/usage", { cache: "no-store", signal: controller.signal }).then(async response => {
    if (!response.ok) throw new Error("Usage unavailable");
    const body = await response.json();
    if (!body.success || !Number.isFinite(Date.parse(body.data?.serverTime))) throw new Error("Invalid usage summary");
    let summary = body.data as AiUsageSummary;
    const latest = latestResponse.get(scope);
    // Some entitlement reads can temporarily omit credit windows while the
    // optional legacy request quotas still return successfully. Preserve the
    // last complete credit meter across all indicator instances in this tab.
    if (latest?.data.credits?.windows && !summary.credits?.windows) {
      summary = { ...summary, credits: latest.data.credits };
    }
    if (!latest || sequence >= latest.sequence) {
      latestResponse.set(scope, { sequence, data: summary });
      return summary;
    }
    // An older in-flight request completed after a newer refresh. Never let
    // its stale usage values roll the meter backwards.
    return latest.data;
  });
  pending = request;
  pendingScope = scope;
  void request.finally(() => { clearTimeout(timeout); if (pending === request) { pending = null; pendingScope = null; } }).catch(() => {});
  return request;
}
export function useAiUsageSummary() {
  const { data: session, status } = useSession();
  const scope = `${session?.user?.tenantId ?? ""}:${session?.user?.id ?? ""}`;
  const [state, setState] = useState<{ scope: string; data?: AiUsageSummary; unavailable: boolean; now: number }>({ scope: "", unavailable: false, now: 0 });
  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    let running = false;
    let dirty = false;
    let data: AiUsageSummary | undefined;
    let clockOrigin = 0;
    let serverOrigin = 0;
    let retryAfter = 0;
    let lastReadAt = 0;
    const now = () => serverOrigin + (performance.now() - clockOrigin);
    const refresh = async (force = false) => {
      if (!active || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      if (running) { dirty = true; return; }
      running = true;
      lastReadAt = performance.now();
      try {
        const result = await readSummary(scope, force);
        if (!active) return;
        retryAfter = 0;
        // A temporary legacy/fallback response must not replace a known-good
        // credit meter with the unrelated optional request-quota windows.
        // Keep the last credit windows until the API returns fresh ones.
        data = data?.credits?.windows && !result.credits?.windows
          ? { ...result, credits: data.credits }
          : result;
        clockOrigin = performance.now();
        serverOrigin = Date.parse(data.serverTime);
        setState({ scope, data, unavailable: false, now: now() });
      } catch {
        retryAfter = performance.now() + 60000;
        data = undefined;
        if (active) setState({ scope, unavailable: true, now: 0 });
      } finally {
        running = false;
        if (dirty && active) { dirty = false; void refresh(true); }
      }
    };
    const invalidate = () => {
      pending = null;
      pendingScope = null;
      void refresh(true);
    };
    const tick = () => {
      if (!active || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      if (data) setState({ scope, data, unavailable: false, now: now() });
      const creditWindowExpired = Boolean(
        data?.credits?.windows && (
          (data.credits.windows.session?.resetsAt && Date.parse(data.credits.windows.session.resetsAt) <= now()) ||
          (data.credits.windows.weekly?.resetsAt && Date.parse(data.credits.windows.weekly.resetsAt) <= now())
        )
      );
      const expired = Boolean(
        data && (
          [data.session, data.weekly, data.monthly].some(m => m?.resetsAt && Date.parse(m.resetsAt) <= now()) ||
          (data.credits?.resetsAt && Date.parse(data.credits.resetsAt) <= now()) ||
          creditWindowExpired
        )
      );
      if (performance.now() >= retryAfter && (expired || !data || performance.now() - lastReadAt >= 60000)) {
        void refresh(expired);
      }
    };
    void refresh();
    const timer = window.setInterval(tick, 15000);
    window.addEventListener(AI_USAGE_CHANGED, invalidate);
    window.addEventListener("online", invalidate);
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(AI_USAGE_CHANGED, invalidate);
      window.removeEventListener("online", invalidate);
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, [scope, status]);
  return status === "authenticated" && state.scope === scope ? state : { data: undefined, unavailable: status === "unauthenticated", now: 0 };
}
