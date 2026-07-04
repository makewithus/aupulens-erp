import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import DocumentNote from "@/models/DocumentNote";

describe("DocumentNote model", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_document_note");
    await DocumentNote.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await DocumentNote.deleteMany({});
  });

  it("creates a notes entry with defaults", async () => {
    const doc = await DocumentNote.create({ tenantId: "t1", kind: "notes", documentType: "invoice", title: "Standard Note", content: "Thank you." });
    expect(doc.isDefault).toBe(false);
    expect(doc.kind).toBe("notes");
  });

  it("rejects an invalid kind", async () => {
    await expect(
      DocumentNote.create({ tenantId: "t1", kind: "bogus" as any, documentType: "invoice", title: "X" }),
    ).rejects.toThrow();
  });

  it("isolates notes/terms by tenantId, kind, and documentType", async () => {
    await DocumentNote.create({ tenantId: "t1", kind: "notes", documentType: "invoice", title: "A" });
    await DocumentNote.create({ tenantId: "t1", kind: "terms", documentType: "invoice", title: "B" });
    await DocumentNote.create({ tenantId: "t2", kind: "notes", documentType: "invoice", title: "C" });

    const t1Notes = await DocumentNote.find({ tenantId: "t1", kind: "notes", documentType: "invoice" }).lean();
    expect(t1Notes).toHaveLength(1);
    expect(t1Notes[0].title).toBe("A");
  });

  it("allows multiple notes for the same document type (not a single default string)", async () => {
    await DocumentNote.create({ tenantId: "t1", kind: "notes", documentType: "invoice", title: "First" });
    await DocumentNote.create({ tenantId: "t1", kind: "notes", documentType: "invoice", title: "Second" });
    const all = await DocumentNote.find({ tenantId: "t1", kind: "notes", documentType: "invoice" }).lean();
    expect(all).toHaveLength(2);
  });
});
