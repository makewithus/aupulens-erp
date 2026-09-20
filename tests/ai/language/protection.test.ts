import { describe, it, expect } from "vitest";
import { protectEntities, unprotectEntities, placeholdersIntact } from "@/lib/ai/language/protect";
import { prepareText } from "@/lib/ai/language/normalise";

const roundTrip = (s: string) => {
  const { masked, entities } = protectEntities(s);
  return { masked, entities, back: unprotectEntities(masked, entities) };
};

describe("entity protection: exact restoration per type", () => {
  const cases: [string, string, string][] = [
    ["email", "mail to ramesh.k+inv@acme-traders.co.in now", "ramesh.k+inv@acme-traders.co.in"],
    ["url", "see https://app.example.com/inv?id=9&x=1 ok", "https://app.example.com/inv?id=9&x=1"],
    ["gstin", "gstin is 27AAPFU0939F1ZV ok", "27AAPFU0939F1ZV"],
    ["pan", "pan AAPFU0939F thanks", "AAPFU0939F"],
    ["tan", "tan is MUMA12345B", "MUMA12345B"],
    ["phone", "call 9876543210 tomorrow", "9876543210"],
    ["date", "due on 30/09/2026 sharp", "30/09/2026"],
    ["code", "product sku-ab12cd stock", "sku-ab12cd"],
    ["code", "invoice INV-2024-0042 paid", "INV-2024-0042"],
    ["quoted", 'note says "recieve  paymnt asap" ok', '"recieve  paymnt asap"'],
  ];
  it.each(cases)("%s", (type, text, value) => {
    const { entities, back, masked } = roundTrip(text);
    expect(entities.some((e) => e.value === value)).toBe(true);
    expect(masked).not.toContain(value);
    expect(back).toBe(text);
    expect(placeholdersIntact(masked, entities)).toBe(true);
  });
  it("a phone number is not misread as an amount, and amounts are NOT masked", () => {
    const { masked } = roundTrip("amount 45000 rupees");
    expect(masked).toContain("45000");
  });
});

describe("Rule 5: normalisation never alters protected things", () => {
  it("company name that is also a common misspelling", () => {
    expect(prepareText("send invoce to Invoce Traders Pvt Ltd").normalised).toBe("send invoice to Invoce Traders Pvt Ltd");
  });
  it("invoice number that looks like a typo", () => {
    expect(prepareText("open INV-0O42 please").normalised).toContain("INV-0O42");
    expect(prepareText("open invoce INV-recipt-9").normalised).toContain("INV-recipt-9");
  });
  it("mixed-case product code", () => expect(prepareText("stock of aB12xY please").normalised).toContain("aB12xY"));
  it("quoted deliberate misspelling stays", () => {
    expect(prepareText('rename the item to "Reciept Pad" now').normalised).toContain('"Reciept Pad"');
    expect(prepareText("call it “Recipt Pad”").normalised).toContain("“Recipt Pad”"); // smart quotes preserved inside the quote
  });
  it("GSTIN untouched", () => expect(prepareText("gstn 27AAPFU0939F1ZV").normalised).toBe("GSTIN 27AAPFU0939F1ZV"));
  it("person's name that is also a Hindi word survives, in sentence and after 'for'", () => {
    const p = prepareText("mujhe invoice banana hai for Kamal");
    expect(p.normalised).toContain("Kamal");
    expect(p.entities.some((e) => e.value === "Kamal")).toBe(true);
  });
  it("multi-word company name is one entity incl. suffix", () => {
    const p = prepareText("bill for Kanchipuram Silks pvt ltd 45k");
    expect(p.entities.some((e) => e.value === "Kanchipuram Silks pvt ltd")).toBe(true);
    expect(p.normalised).toContain("Kanchipuram Silks pvt ltd");
    expect(p.normalised).toContain("45000");
  });
  it("sentence-start name that is not a known word is protected", () => {
    expect(prepareText("Acme ke liye invoice banao").entities.some((e) => e.value === "Acme")).toBe(true);
  });
});

describe("placeholder integrity", () => {
  it("detects a dropped or duplicated placeholder", () => {
    const { masked, entities } = protectEntities("bill Acme Traders, then Globex Corp");
    expect(entities.length).toBeGreaterThan(1);
    expect(placeholdersIntact(masked.replace(entities[0].placeholder, ""), entities)).toBe(false);
    expect(placeholdersIntact(masked + " " + entities[0].placeholder, entities)).toBe(false);
  });
});

describe("live findings: protection at the START of a message", () => {
  it("'Recipt Traders ke liye…' — a company whose name is a known misspelling is a NAME, not a typo (live: it was 'corrected' to 'Receipt')", () => {
    const p = prepareText("Recipt Traders ke liye invoice banao, INV-0O42 ki copy bhejo");
    expect(p.entities.map((e) => e.value)).toEqual(expect.arrayContaining(["Recipt Traders", "INV-0O42"]));
    expect(p.normalised).toContain("Recipt Traders");
    expect(p.normalised).not.toContain("Receipt");
  });
  it("…but a lone misspelling at the start is still a typo: 'Invoce banao' → 'Invoice banao'", () => {
    expect(prepareText("Invoce banao for Acme").normalised).toMatch(/^Invoice banao/);
  });
  it("'Invoce Pad 250' at the start is a product name", () => {
    expect(prepareText("Invoce Pad 250 rupaye").normalised).toContain("Invoce Pad");
  });
  it("an elongated word is not a name: 'PLEASEEEE mujhe…' collapses to 'PLEASE' (live: it was masked and reached the translator)", () => {
    const p = prepareText("PLEASEEEE mujhe invoice banana hai Acme Industries ke liye");
    expect(p.entities.some((e) => /PLEASE/i.test(e.value))).toBe(false);
    expect(p.normalised.toLowerCase()).toContain("please mujhe");
    expect(p.entities.some((e) => e.value === "Acme Industries")).toBe(true);
  });
});

describe("live findings: entity boundaries", () => {
  it("a PAN is one entity — a name run cannot swallow part of it ('PAN AAPFU0939F' was split into 'PAN AAPFU' + 'F')", () => {
    const p = prepareText("PAN AAPFU0939F wale customer ke liye invoice banao");
    expect(p.entities.map((e) => e.value)).toEqual(["AAPFU0939F"]);
    expect(p.normalised).toBe("PAN AAPFU0939F wale customer ke liye invoice banao");
  });
  it("GSTIN and TAN likewise", () => {
    expect(prepareText("Acme Trading GSTIN 27AAPFU0939F1ZV").entities.map((e) => e.value)).toEqual(["Acme Trading", "27AAPFU0939F1ZV"]);
    expect(prepareText("tan MUMA12345B").entities.map((e) => e.value)).toEqual(["MUMA12345B"]);
  });
});
