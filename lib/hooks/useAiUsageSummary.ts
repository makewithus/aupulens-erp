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
function readSummary(scope: string): Promise<AiUsageSummary> {
  if (pending && pendingScope === scope) return pending;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const request = fetch("/api/ai/usage", { cache: "no-store", signal: controller.signal }).then(async response => {
    if (!response.ok) throw new Error("Usage unavailable");
    const body = await response.json();
    if (!body.success || !Number.isFinite(Date.parse(body.data?.serverTime))) throw new Error("Invalid usage summary");
    return body.data as AiUsageSummary;
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
    const now = () => serverOrigin + (performance.now() - clockOrigin);
    const refresh = async () => {
      if (!active || document.visibilityState === "hidden") return;
      if (running) { dirty = true; return; }
      running = true;
      try {
        const result = await readSummary(scope);
        if (!active) return;
        retryAfter = 0;
        data = result;
        clockOrigin = performance.now();
        serverOrigin = Date.parse(result.serverTime);
        setState({ scope, data, unavailable: false, now: now() });
      } catch {
        retryAfter = performance.now() + 60000;
        data = undefined;
        if (active) setState({ scope, unavailable: true, now: 0 });
      } finally {
        running = false;
        if (dirty && active) { dirty = false; void refresh(); }
      }
    };
    const invalidate = () => { void refresh(); };
    const tick = () => {
      if (!active || document.visibilityState === "hidden") return;
      if (data) setState({ scope, data, unavailable: false, now: now() });
      const expired = data && [data.session, data.weekly, data.monthly].some(m => m.resetsAt && Date.parse(m.resetsAt) <= now());
      if (performance.now() >= retryAfter && (expired || !data)) void refresh();
    };
    void refresh();
    const timer = window.setInterval(tick, 15000);
    window.addEventListener(AI_USAGE_CHANGED, invalidate);
    window.addEventListener("online", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(AI_USAGE_CHANGED, invalidate);
      window.removeEventListener("online", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, [scope, status]);
  return status === "authenticated" && state.scope === scope ? state : { data: undefined, unavailable: status === "unauthenticated", now: 0 };
}
