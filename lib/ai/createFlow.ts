import { CREATE_VERB_RX, findCreateTarget } from "@/lib/ai/createTargets";
import { stashPrefill } from "@/lib/ai/aiPrefill";

export interface CreateFlowAttachment {
  name: string;
  type: string;
  dataUrl: string;
}

export type CreateFlowOutcome =
  | { handled: false }
  | { handled: true; message: string; route?: string };

/**
 * The single entry point every AI Assistant surface (the global panel AND
 * every per-module ai-assistant page) calls FIRST, before falling back to
 * their own Q&A endpoint. If the message is a create request, this extracts
 * the fields via /api/ai/prefill, stashes them, and returns the route to
 * navigate to — including a DIFFERENT module's route when that's what the
 * message actually means (e.g. typing "create an employee" while sitting in
 * the Manufacturing assistant still lands on /hr/employees). If it's not a
 * create request at all, `handled: false` tells the caller to proceed with
 * its normal conversational flow, unchanged.
 *
 * Deliberately simpler than AiSidebar's own ask-before-redirect flow for a
 * missing dependency (e.g. an unmatched vendor name): here we still stash +
 * navigate, just with the gap called out in `message`, rather than pausing
 * for a yes/no reply. Replicating that multi-turn confirmation identically
 * across half a dozen independent chat UIs is a larger follow-up; this keeps
 * every surface at least CORRECT and CONSISTENT today rather than partially
 * wired in some places and not others.
 */
export async function tryAiCreateFlow(input: {
  text: string;
  attachments?: CreateFlowAttachment[];
  history?: { role: string; content: string }[];
}): Promise<CreateFlowOutcome> {
  const q = input.text.trim();
  if (!q || !CREATE_VERB_RX.test(q)) return { handled: false };
  const targetDef = findCreateTarget(q);
  if (!targetDef) return { handled: false };

  try {
    const res = await fetch("/api/ai/prefill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: targetDef.target,
        message: q,
        attachments: input.attachments || [],
        history: input.history || [],
      }),
    });
    const data = await res.json().catch(() => ({}));
    const extracted = data?.data && typeof data.data === "object"
      ? Object.values(data.data).some((v: any) => (Array.isArray(v) ? v.length > 0 : v != null && v !== ""))
      : false;

    if (res.ok && data.success && !extracted && !data.missingDependency) {
      return {
        handled: true,
        message: `I couldn't pull enough details to fill the ${targetDef.label} form. Tell me the details in your message (or attach a document/image) and I'll prepare it for you.`,
      };
    }
    if (res.ok && data.success) {
      const sugg = data.suggestions?.length
        ? `\n\n**A couple of things to double-check:**\n${data.suggestions.map((s: string) => `- ${s}`).join("\n")}`
        : "";
      const dep = data.missingDependency
        ? `\n\n⚠️ There's no ${data.missingDependency.type} named **${data.missingDependency.name}** yet — add it with the "+" on the form (or create it first), then it'll be selectable.`
        : "";
      stashPrefill({ target: data.target, route: data.route, data: data.data || {}, suggestions: data.suggestions || [] });
      return {
        handled: true,
        message: `I've prepared the ${targetDef.label} form with the details I found — review them and click **Create** to save.${dep}${sugg}`,
        route: targetDef.route,
      };
    }
    return {
      handled: true,
      message: data.message || `I couldn't prepare the ${targetDef.label} form. Please add a bit more detail and try again.`,
    };
  } catch {
    return { handled: true, message: "Something went wrong preparing the form. Please try again." };
  }
}
