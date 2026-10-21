import { describe, expect, it } from "vitest";
import AiMemory from "@/models/ai/AiMemory";

describe("AI memory schema", () => {
  it("accepts every advertised module scope, including CRM", () => {
    const scopes = AiMemory.schema.path("scope").options.enum as string[];
    expect(scopes).toContain("crm");
  });
});
