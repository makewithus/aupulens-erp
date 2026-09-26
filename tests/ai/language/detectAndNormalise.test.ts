import { describe, it, expect } from "vitest";
import { detectLanguage } from "@/lib/ai/language/detect";
import { prepareText } from "@/lib/ai/language/normalise";
import { normaliseNumbers } from "@/lib/ai/language/numbers";

describe("detect (local, no provider)", () => {
  it("plain English", () => expect(detectLanguage("Create an invoice for Acme, 45000 rupees, due in 30 days").kind).toBe("english"));
  it("Devanagari Hindi", () => {
    const d = detectLanguage("मुझे Acme के लिए इनवॉइस बनाना है");
    expect(d.script).toBe("Deva");
    expect(d.language).toBe("hi-IN");
  });
  it("Roman Hindi", () => {
    const d = detectLanguage("mujhe Acme ke liye invoice banana hai");
    expect(d.kind === "romanised" || d.kind === "mixed").toBe(true);
    expect(d.language).toBe("hi-IN");
  });
  it("English with two Hindi words is code-mixed", () => {
    expect(detectLanguage("invoice banao for Acme, amount 45000 rupees").kind).not.toBe("english");
  });
  it("Tamil script", () => expect(detectLanguage("Acme க்கு இன்வாய்ஸ் உருவாக்கு").language).toBe("ta-IN"));
  it("Marathi vs Hindi in Devanagari", () => {
    expect(detectLanguage("मला बीजक तयार करायचे आहे").language).toBe("mr-IN");
  });
  it("three scripts in one sentence still resolves and is flagged ambiguous", () => {
    const d = detectLanguage("invoice बनाओ இன்வாய்ஸ் ఇన్వాయిస్");
    expect(d.ambiguous).toBe(true);
    expect(d.kind).toBe("mixed");
  });
  it("numbers only / one punctuation-only string => none", () => {
    expect(detectLanguage("45000").kind).toBe("none");
    expect(detectLanguage("!!! 🙂").kind).toBe("none");
  });
  it("one English word", () => expect(detectLanguage("invoice").kind).toBe("english"));
  it("unsupported script (Arabic/Chinese) => unsupported", () => {
    expect(detectLanguage("أريد إنشاء فاتورة").kind).toBe("unsupported");
    expect(detectLanguage("请创建发票给客户").kind).toBe("unsupported");
  });
  it("a name that is also a Hindi word does not flip English to Hindi", () => {
    expect(detectLanguage("Send the invoice to Kamal Sunder").kind).toBe("english");
  });
  it("one stray Hindi word in a long English paste stays English", () => {
    const paste = ("Please review the attached quarterly statement and confirm the totals for each vendor before Friday. ").repeat(6) + "theek";
    expect(detectLanguage(paste).kind).toBe("english");
  });
});

describe("deterministic normalisation", () => {
  it("strips zero-width chars, smart quotes, emoji, extra spaces (copy only)", () => {
    const raw = "Create​  an   invoice “please” 🙂🙂";
    const p = prepareText(raw);
    expect(p.normalised).not.toMatch(/[​🙂]/u);
    expect(p.normalised).toContain("Create an invoice");
    expect(raw).toContain("​"); // original untouched
  });
  it("keeps newlines (pasted tables are input, not damage) but collapses runs", () => {
    expect(prepareText("a\n\n\n\nb").normalised).toBe("a\n\nb");
    expect(prepareText("Name\tQty\nWidget\t3").normalised).toContain("\t");
  });
  it("fixes domain misspellings", () => {
    const p = prepareText("create an invoce for the custmer, recipt and GSTN");
    expect(p.normalised).toBe("create an invoice for the customer, receipt and GSTIN");
    expect(p.rewrites.length).toBeGreaterThan(0);
  });
  it("guarded fuzzy fixes an unlisted domain typo but not inflections", () => {
    expect(prepareText("list every expensse today").normalised).toBe("list every expense today");
    expect(prepareText("show invoices").normalised).toBe("show invoices");
  });
  it("collapses repeated characters", () => {
    expect(prepareText("pleaseeee create invoice").normalised).toBe("please create invoice");
    expect(prepareText("yesss").normalised).toBe("yes");
  });
  it("does not lowercase ALL CAPS input (names must survive)", () => {
    expect(prepareText("CREATE INVOICE FOR ACME TRADERS").normalised).toBe("CREATE INVOICE FOR ACME TRADERS");
  });
  it("maps Marathi बीजक to invoice before provider translation", () => {
    const p = prepareText("Acme साठी 45000 रुपयांचे बीजक तयार करा");
    expect(p.normalised).toContain("इनव्हॉइस");
    expect(p.rewrites).toContain("बीजक → इनव्हॉइस");
  });
  it("comma spacing", () => expect(prepareText("invoice,for Acme").normalised).toBe("invoice, for Acme"));
});

describe("number canonicalisation (exact, value-preserving)", () => {
  it.each([
    ["45k", "45000"], ["2.5k", "2500"], ["1.5 lakh", "150000"], ["2 crore", "20000000"],
    ["45,000", "45000"], ["1,00,000", "100000"], ["12,34,567", "1234567"], ["1,234,567", "1234567"],
    ["₹४५०००", "₹45000"], ["forty five thousand", "45000"], ["two lakh", "200000"], ["one hundred and five", "105"],
  ])("%s -> %s", (a, b) => expect(normaliseNumbers(a).text).toBe(b));
  it("does not touch a lone word-number or non-integer-safe scaling", () => {
    expect(normaliseNumbers("one invoice").text).toBe("one invoice");
    expect(normaliseNumbers("1.2345k").text).toBe("1.2345k"); // would not be an exact integer
  });
  it("leaves lists and ids alone", () => {
    expect(normaliseNumbers("items 1,2,3").text).toBe("items 1,2,3");
    expect(prepareText("open INV-45k now").normalised).toBe("open INV-45k now"); // masked as a code first
  });
});
