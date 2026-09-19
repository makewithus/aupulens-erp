import { describe, it, expect } from "vitest";
import { resolveDate, todayIST } from "@/lib/ai/taskFlow/dates";
import { classifyIntent, parseControl, matchCustomers } from "@/lib/ai/taskFlow/parse";

const TODAY = "2026-09-19"; // Saturday
const iso = (t: string, cue = false) => resolveDate(t, TODAY, cue)?.iso ?? null;

describe("dates (today = Sat 19 Sep 2026, IST)", () => {
  it.each([
    ["today", "2026-09-19"], ["tomorrow", "2026-09-20"], ["day after tomorrow", "2026-09-21"],
    ["in 30 days", "2026-10-19"], ["within 2 weeks", "2026-10-03"], ["net 30", "2026-10-19"],
    ["next Friday", "2026-09-25"], ["Monday", "2026-09-21"], ["next Saturday", "2026-09-26"],
    ["end of month", "2026-09-30"], ["in 1 month", "2026-10-19"],
    ["2026-12-31", "2026-12-31"], ["25/12/2026", "2026-12-25"], ["25-12-26", "2026-12-25".replace("2025", "2026")],
    ["30 Sep 2026", "2026-09-30"], ["30th September", "2026-09-30"], ["Sep 30, 2026", "2026-09-30"],
  ])("%s → %s", (t, d) => expect(iso(t)).toBe(d));
  it("bare 'N days' is a due-in only with a cue", () => {
    expect(iso("30 days")).toBeNull();
    expect(iso("30 days", true)).toBe("2026-10-19");
  });
  it("month arithmetic clamps to month end (31 Jan + 1 month = 28/29 Feb)", () => {
    expect(resolveDate("in 1 month", "2026-01-31")?.iso).toBe("2026-02-28");
  });
  it("invalid / out-of-range dates are refused, not guessed", () => {
    for (const t of ["31/02/2026", "2062-01-01", "30/13/2026", "32 Sep 2026", "someday", "soon"]) expect(iso(t)).toBeNull();
  });
  it("todayIST uses India's calendar day, not the server's", () => {
    expect(todayIST(new Date("2026-09-18T19:00:00Z"))).toBe("2026-09-19"); // 00:30 IST
  });
});

describe("explain / do / ask classifier (normalised English)", () => {
  const N = /\binvoices?\b/i;
  it.each([
    ["How do I create an invoice?", "explain"], ["how to make an invoice", "explain"], ["What is an invoice?", "explain"],
    ["Where do I find the invoice screen", "explain"], ["steps to create invoice", "explain"], ["Explain how invoices work", "explain"],
    ["Create an invoice for Acme, 45000, due 30 days", "do"], ["create invoice", "do"], ["Please generate an invoice for Kamal", "do"],
    ["Can you create an invoice for Kamal?", "do"], ["I want to create an invoice", "do"], ["make a new invoice", "do"],
    ["Can I create an invoice without a customer?", "ambiguous"], ["invoice creation", "ambiguous"], ["Creating an invoice", "ambiguous"],
    ["Should I create an invoice or a quote?", "ambiguous"], ["Is it possible to create an invoice by email", "ambiguous"],
    ["show me unpaid invoices", "none"], ["how many invoices are overdue", "none"], ["delete invoice 5", "none"], ["create a lead", "none"],
  ])("%s → %s", (t, want) => {
    expect(classifyIntent(t, N)).toBe(want);
  });
  it("control words", () => {
    expect(parseControl("Cancel.")).toBe("cancel");
    expect(parseControl("never mind")).toBe("cancel");
    expect(parseControl("go back")).toBe("back");
    expect(parseControl("skip")).toBe("skip");
    expect(parseControl("that's all")).toBe("skip_rest");
    expect(parseControl("YES")).toBe("confirm");
    expect(parseControl("Acme Traders")).toBeNull();
    expect(parseControl("yes please invoice Acme")).toBeNull();
  });
});

describe("customer matching never auto-accepts a near match", () => {
  const C = [{ id: "1", name: "Acme Trading", aliases: ["Acme Trading"] }, { id: "2", name: "Acme Industries", aliases: [] }, { id: "3", name: "Zed", aliases: [] }];
  it("exact is case/punctuation-insensitive", () => expect(matchCustomers("acme  trading.", C).exact.map((c) => c.id)).toEqual(["1"]));
  it("Acme Traders is NEAR to both Acme customers but exact to none", () => {
    const m = matchCustomers("Acme Traders", C);
    expect(m.exact).toEqual([]);
    expect(m.near.map((c) => c.id).sort()).toEqual(["1", "2"]);
  });
  it("unrelated names match nothing", () => expect(matchCustomers("Globex", C)).toEqual({ exact: [], near: [] }));
});
