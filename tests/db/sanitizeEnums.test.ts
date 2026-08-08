import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { sanitizeEnumFields } from "@/lib/db/sanitizeEnums";

// A throwaway model with enum + non-enum paths to exercise the sanitizer.
const schema = new mongoose.Schema({
  stage: { type: String, enum: ["Prospecting", "Proposal Sent", "Closed Won"], default: "Prospecting" },
  priority: { type: String, enum: ["Low", "Medium", "High"] },
  title: { type: String },
  amount: { type: Number },
});
const TestModel = (mongoose.models.SanitizeEnumTest as mongoose.Model<any>) || mongoose.model("SanitizeEnumTest", schema);

describe("sanitizeEnumFields", () => {
  it("drops an invalid enum value so the schema default can apply", () => {
    const body: any = { stage: "Proposal / Price Quote", title: "Deal A" };
    sanitizeEnumFields(TestModel, body);
    expect("stage" in body).toBe(false);
    expect(body.title).toBe("Deal A");
  });

  it("drops an empty-string enum value (unselected optional field)", () => {
    const body: any = { priority: "", title: "Deal B" };
    sanitizeEnumFields(TestModel, body);
    expect("priority" in body).toBe(false);
    expect(body.title).toBe("Deal B");
  });

  it("keeps valid enum values untouched", () => {
    const body: any = { stage: "Closed Won", priority: "High" };
    sanitizeEnumFields(TestModel, body);
    expect(body.stage).toBe("Closed Won");
    expect(body.priority).toBe("High");
  });

  it("never touches non-enum fields", () => {
    const body: any = { title: "", amount: 0 };
    sanitizeEnumFields(TestModel, body);
    expect(body.title).toBe("");
    expect(body.amount).toBe(0);
  });

  it("is a no-op for a null/invalid body", () => {
    expect(() => sanitizeEnumFields(TestModel, null as any)).not.toThrow();
  });
});
