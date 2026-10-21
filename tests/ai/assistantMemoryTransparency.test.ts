import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_ASSISTANT_GUIDANCE } from "@/lib/ai/assistantGuidance";

describe("shared assistant memory transparency guidance", () => {
  it("explains active conversation persistence separately from cross-chat recall", () => {
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/completed turns.*saved by the server as conversation history/i);
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/active-chat history is separate from cross-chat recall/i);
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/reloaded for that same authorized user, tenant, and module/i);
  });

  it("describes limited, permission-scoped cross-chat recall and explicit saved facts", () => {
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/relevant stored conversation summaries\/excerpts and explicitly approved memory facts/i);
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/tenant, user, role, and module permissions/i);
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/not an unlimited searchable copy of every past message/i);
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/every message or personal detail becomes a permanent fact/i);
  });

  it("clarifies that pausing cross-chat recall leaves active-chat history intact", () => {
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/Turning cross-chat memory off suppresses prior-chat recall and saved facts but does not turn off active-chat history/i);
  });

  it("does not imply deleting a saved fact deletes its source chat", () => {
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/Deleting a saved fact deletes that memory item; it does not delete the source conversation or its summary/i);
  });

  it("does not promise indefinite retention or categorically deny persistence", () => {
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/Server\/storage failures can prevent a completed turn from being retained/i);
    expect(AI_ASSISTANT_GUIDANCE).toMatch(/Never categorically claim that Aupulens does not store conversation history or memory/i);
    expect(AI_ASSISTANT_GUIDANCE).not.toMatch(/I do not permanently store memory from conversations|conversation history is not retained after the session ends/i);
  });

  it("is attached to every user-facing conversational assistant route", () => {
    const routes = [
      "app/api/admin/ai-assistant/route.ts",
      "app/api/crm/ai-assistant/route.ts",
      "app/api/finance/ai-assistant/route.ts",
      "app/api/hr/ai-assistant/route.ts",
      "app/api/inventory/ai-assistant/route.ts",
      "app/api/manufacturing/ai-assistant/route.ts",
      "app/api/sales/ai-assistant/route.ts",
    ];

    for (const route of routes) {
      const source = readFileSync(resolve(process.cwd(), route), "utf8");
      expect(source, `${route} should use the shared memory-aware instructions`).toContain("AI_ASSISTANT_GUIDANCE");
    }
  });
});
