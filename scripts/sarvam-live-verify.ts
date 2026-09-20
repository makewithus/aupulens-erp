/**
 * LIVE verification against the REAL Sarvam API (BRIEF-SARVAM-4). NEVER runs in CI (not under tests/, not imported anywhere).
 *   npx tsx scripts/sarvam-live-verify.ts <step> [args]
 * steps: ping | placeholder [fmt] | roundtrip | phrases | messy | protect | failure | latency [n]
 * Rules: the API key is read from .env only; every line printed or written passes through scrub(), which also refuses to
 * emit anything containing the key. Every run prints the number of API calls it made (credits are finite). Results are
 * written (scrubbed) to docs/sarvam/live-results/<step>.json.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createSarvamClient } from "../lib/ai/language/sarvam/client";
import { getSarvamConfig } from "../lib/ai/language/config";
import { setSarvamClientForTests } from "../lib/ai/language/sarvam/client";
import { prepareLanguageInput, clearLanguageCache } from "../lib/ai/language/pipeline";
import { respondInLanguage, clearReplyCache } from "../lib/ai/language/respond";
import { numbersPreserved } from "../lib/ai/language/translate";
import { PHRASES } from "./sarvam-live-phrases";

const KEY = (process.env.SARVAM_API_KEY ?? "").trim();
if (!KEY) { console.error("SARVAM_API_KEY is not set in .env — nothing to verify live."); process.exit(2); }

export function scrub(s: string): string {
  let out = s.split(KEY).join("***KEY***");
  out = out.replace(/(api-subscription-key["':\s=]+)[A-Za-z0-9_\-]{12,}/gi, "$1***KEY***");
  return out;
}
const say = (...a: unknown[]) => console.log(scrub(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
function save(name: string, data: unknown) {
  const text = scrub(JSON.stringify(data, null, 2));
  if (text.includes(KEY)) throw new Error("refusing to write output containing the key");
  fs.writeFileSync(path.join("docs/sarvam/live-results", `${name}.json`), text);
}

// ── call counting (credits) ──────────────────────────────────────────────────────
const calls: { path: string; chars: number; ms: number; status: number | string }[] = [];
const countingFetch: typeof fetch = async (url, init) => {
  const t = Date.now();
  let chars = 0;
  try { chars = String(JSON.parse(String((init as any)?.body ?? "{}")).input ?? "").length; } catch { /* */ }
  try {
    const r = await fetch(url as any, init);
    calls.push({ path: String(url).replace(/^https?:\/\/[^/]+/, ""), chars, ms: Date.now() - t, status: r.status });
    return r;
  } catch (e) {
    calls.push({ path: String(url).replace(/^https?:\/\/[^/]+/, ""), chars, ms: Date.now() - t, status: "network/timeout" });
    throw e;
  }
};
const cfg = (timeoutMs?: number, key = KEY) => () => ({ ...getSarvamConfig(), apiKey: key, timeoutMs: timeoutMs ?? Math.max(getSarvamConfig().timeoutMs, 8000) });
const client = createSarvamClient({ fetchFn: countingFetch, config: cfg() });
const summary = () => say(`\n[credits] API calls this run: ${calls.length} (${calls.reduce((s, c) => s + c.chars, 0)} input characters)`);
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

const FORMATS: Record<string, (i: number) => string> = {
  zxq: (i) => `ZXQ${i}ZXQ`, ent: (i) => `Ent${i}`, pname: (i) => ["Qavrix Holdings", "Zolmen Traders", "Wextra Silks"][i], brackets: (i) => `[[E${i}]]`, angle: (i) => `<<${i}>>`, braces: (i) => `{{${i}}}`, tag: (i) => `<x id="${i}"/>`, word: (i) => `Entity${i}X`,
};
const LANGS: { id: string; code: string; roman?: boolean }[] = [
  { id: "hi-native", code: "hi-IN" }, { id: "hi-roman", code: "hi-IN", roman: true }, { id: "ta", code: "ta-IN" }, { id: "te", code: "te-IN" }, { id: "mr", code: "mr-IN" },
  { id: "bn", code: "bn-IN" }, { id: "gu", code: "gu-IN" }, { id: "kn", code: "kn-IN" }, { id: "ml", code: "ml-IN" }, { id: "pa", code: "pa-IN" }, { id: "or", code: "od-IN" },
];
const phrase = (id: string) => PHRASES.find((p) => p.id === id)!;
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

async function main() {
  const [step = "ping", ...args] = process.argv.slice(2);
  say(`step=${step}  base=${getSarvamConfig().baseUrl}  key=${KEY ? "present(" + KEY.length + " chars)" : "MISSING"}`);

  if (step === "ping") {
    const r = await client.translate({ input: "Create an invoice for Acme", source: "en-IN", target: "hi-IN", model: "mayura:v1", mode: "modern-colloquial" });
    say(r.ok === true ? { ok: true, out: r.data.translatedText, ms: r.latencyMs } : { ok: false, error: (r as any).error, ms: r.latencyMs });
  }

  // ── 1. placeholder format ───────────────────────────────────────────────────
  if (step === "placeholder") {
    const fmtName = args[0] ?? "zxq";
    const P = FORMATS[fmtName];
    const rows: any[] = [];
    for (const L of LANGS) {
      const src = phrase(L.id).text.replace("Acme", P(0)) + ` ${P(1)}`;
      const a = await client.translate({ input: src, source: L.roman ? "auto" : L.code, target: "en-IN", model: "mayura:v1", mode: L.roman ? "code-mixed" : "modern-colloquial" });
      const toEn = a.ok ? a.data.translatedText : null;
      const en = `Open ${P(0)} and check ${P(1)} for ₹45000.`;
      const b = await client.translate({ input: en, source: "en-IN", target: L.code, model: "mayura:v1", mode: "modern-colloquial", outputScript: L.roman ? "roman" : undefined });
      const fromEn = b.ok ? b.data.translatedText : null;
      const okA = toEn !== null && [0, 1].every((i) => count(toEn, P(i)) === 1);
      const okB = fromEn !== null && [0, 1].every((i) => count(fromEn, P(i)) === 1);
      rows.push({ lang: L.id, fmt: fmtName, toEnglish: { ok: okA, in: src, out: toEn, err: a.ok === false ? a.error.kind : undefined }, fromEnglish: { ok: okB, in: en, out: fromEn, err: b.ok === false ? b.error.kind : undefined } });
      say(`${okA && okB ? "✔" : "✘"} ${L.id.padEnd(9)} →EN:${okA ? "intact" : "ALTERED"}  EN→:${okB ? "intact" : "ALTERED"}   ${toEn ?? "-"}   ||   ${fromEn ?? "-"}`);
    }
    save(`placeholder-${fmtName}`, rows);
    say(`format ${fmtName}: ${rows.filter((r) => r.toEnglish.ok && r.fromEnglish.ok).length}/${rows.length} languages fully intact`);
  }

  // ── 2. round trip ───────────────────────────────────────────────────────────
  if (step === "roundtrip") {
    const P = FORMATS[args[0] ?? "zxq"];
    const SENTS = [
      "Please create an invoice for P0 for 45000 rupees, due in 30 days.",
      "Send P0 a reminder: invoice P1 of 12500 rupees is overdue.",
    ];
    const rows: any[] = [];
    for (const L of LANGS) {
      for (const s of SENTS) {
        const P0 = P(0), P1 = P(1);
        const en = s.replace("P0", P0).replace("P1", P1);
        const there = await client.translate({ input: en, source: "en-IN", target: L.code, model: "mayura:v1", mode: "modern-colloquial", outputScript: L.roman ? "roman" : undefined });
        if (there.ok === false) { rows.push({ lang: L.id, en, err: there.error.kind }); continue; }
        const back = await client.translate({ input: there.data.translatedText, source: L.code, target: "en-IN", model: "mayura:v1", mode: L.roman ? "code-mixed" : "modern-colloquial" });
        const backEn = back.ok ? back.data.translatedText : null;
        const ents = backEn ? [P0, ...(en.includes(P1) ? [P1] : [])].every((p) => count(backEn, p) === 1) : false;
        const nums = backEn ? numbersPreserved(en, backEn) : false;
        rows.push({ lang: L.id, en, there: there.data.translatedText, back: backEn, entitiesIntact: ents, numbersPreserved: nums });
        say(`${ents && nums ? "✔" : "✘"} ${L.id.padEnd(9)} ents:${ents} nums:${nums}\n     EN : ${en}\n     ${L.id}: ${there.data.translatedText}\n     back: ${backEn}`);
      }
    }
    save(`roundtrip-${args[0] ?? "zxq"}`, rows);
    const bad = rows.filter((r) => r.entitiesIntact === false || r.err).length;
    say(`format ${args[0] ?? "zxq"}: entity failures ${bad}/${rows.length}; numbers preserved ${rows.filter((r) => r.numbersPreserved).length}/${rows.length}`);
  }

  // ── 3/4/5. phrases, messy, protected — through the REAL pipeline ─────────────
  const viaPipeline = async (name: string, list: { id: string; text: string; expect: string }[]) => {
    setSarvamClientForTests(client);
    const rows: any[] = [];
    for (const p of list) {
      clearLanguageCache();
      const t = await prepareLanguageInput({ tenantId: "live-verify", rawText: p.text });
      const low = t.modelText.toLowerCase();
      rows.push({ id: p.id, typed: p.text, expected: p.expect, language: t.detectedLanguage, kind: t.kind, modelGot: t.modelText, degraded: t.degraded ? t.degradedReason : false, lowConfidence: t.lowConfidence, protected: t.entitiesProtected, rewrites: t.rewrites, calls: t.providerCalls.map((c) => `${c.type}/${c.model} ${c.characters}ch ${c.latencyMs}ms ${c.ok ? "ok" : c.error}`), ms: t.totalLatencyMs,
        hasInvoice: /invoice|bill/.test(low), keeps45000: /45000/.test(t.modelText) || !/45/.test(p.text) });
      say(`── ${p.id}\n   typed   : ${p.text}\n   expected: ${p.expect}\n   modelGot: ${t.modelText}\n   lang=${t.detectedLanguage} kind=${t.kind} degraded=${t.degraded ? t.degradedReason : "no"} lowConf=${t.lowConfidence} ${t.totalLatencyMs}ms\n   protected: ${t.entitiesProtected.map((e) => e.type + ":" + e.value).join(" | ") || "-"}  rewrites: ${t.rewrites.join(", ") || "-"}`);
    }
    save(name, rows);
  };
  if (step === "phrases") await viaPipeline("phrases", PHRASES.filter((p) => !["number-words-en"].includes(p.id) || true));
  if (step === "messy") await viaPipeline("messy", [
    { id: "cm-1", text: "invoice banao for Acme Trading, amount 45000 rupees", expect: "create an invoice for Acme Trading, amount 45000 rupees" },
    { id: "cm-2", text: "Acme Trading ke liye invoice banao, 45k, due agle mangalwar", expect: "create invoice for Acme Trading, 45000, due next Tuesday" },
    { id: "cm-3", text: "bhai ek invoice bana do Kamal ke naam, 5000 ka, consulting", expect: "bro make an invoice in Kamal's name, of 5000, consulting" },
    { id: "wa-1", text: "hi ​please​ create  invoice\n\nfor   Acme Trading 😊😊\n45,000 rs   due 30 days\n\n\nthx 🙏", expect: "create invoice for Acme Trading 45000 due 30 days" },
    { id: "wa-2", text: "PLEASEEEE mujhe invoice banana hai Acme Industries ke liye 1,00,000 rupaye 🙏🙏", expect: "please I want to make an invoice for Acme Industries 100000 rupees" },
    { id: "wa-3", text: "“invoice” banao  Kamal  ke liye ,,  paanch hazaar rupaye", expect: "make an invoice for Kamal, five thousand (5000) rupees" },
    { id: "typo-1", text: "mujhe invce banana hai custmer Acme Trading ke liye amout 45000", expect: "I want to make an invoice for customer Acme Trading amount 45000" },
    { id: "long-1", text: ("mujhe Acme Trading ke liye invoice banana hai, 45000 rupaye. ").repeat(40), expect: "(40× the same request, 2400 chars — chunked)" },
  ]);
  if (step === "protect") await viaPipeline("protect", [
    { id: "pr-name-typo", text: "Recipt Traders ke liye invoice banao 45000", expect: "…Recipt Traders… verbatim (not 'Receipt')" },
    { id: "pr-name-typo2", text: "Invoce Traders ko invoice bhejo 500 rupaye", expect: "…Invoce Traders… verbatim" },
    { id: "pr-invno", text: "INV-0O42 ki copy bhejo Acme Trading ko", expect: "INV-0O42 verbatim (not INV-0042)" },
    { id: "pr-gstin", text: "Acme Trading ka GSTIN 27AAPFU0939F1ZV hai, invoice banao 500", expect: "27AAPFU0939F1ZV verbatim" },
    { id: "pr-pan", text: "PAN AAPFU0939F wale customer ke liye invoice banao", expect: "AAPFU0939F verbatim" },
    { id: "pr-quote", text: 'item ka naam "Reciept Pad" rakho aur invoice banao', expect: '"Reciept Pad" verbatim incl. quotes' },
    { id: "pr-sku", text: "SKU aB12-xY9 ka stock dikhao", expect: "aB12-xY9 verbatim" },
    { id: "pr-email", text: "ramesh.k+inv@acme-traders.co.in ko invoice bhejo", expect: "email verbatim" },
    { id: "pr-hindi-name", text: "Kamal ke liye invoice banao 500", expect: "Kamal verbatim (also a Hindi word)" },
    { id: "pr-ta-name", text: "Kanchipuram Silks Pvt Ltd க்கு இன்வாய்ஸ் உருவாக்கு 12000", expect: "Kanchipuram Silks Pvt Ltd verbatim" },
  ]);

  // ── 6. failure paths ────────────────────────────────────────────────────────
  if (step === "failure") {
    const rows: any[] = [];
    const note = (name: string, r: unknown) => { rows.push({ name, ...(r as object) }); say(`▶ ${name}: ${JSON.stringify(r)}`); };
    // (a) invalid key through the pipeline
    process.env.SARVAM_API_KEY = "definitely-not-a-valid-key-0000";
    setSarvamClientForTests(createSarvamClient({ fetchFn: countingFetch, config: cfg(5000, "definitely-not-a-valid-key-0000") }));
    clearLanguageCache();
    const a = await prepareLanguageInput({ tenantId: "live-verify", rawText: "mujhe Acme Trading ke liye invoice banana hai 45000" });
    note("invalid key → pipeline", { degraded: a.degraded, reason: a.degradedReason, modelText: a.modelText, lowConfidence: a.lowConfidence, calls: a.providerCalls.map((c) => c.error) });
    process.env.SARVAM_API_KEY = KEY;
    // (b) malformed request straight at the API (bad language code + empty input) via the client
    const b1 = await client.translate({ input: "hello", source: "xx-XX", target: "en-IN" });
    note("bad language code → client", b1.ok === true ? { ok: true, out: b1.data } : { ok: false, kind: (b1 as any).error.kind, status: (b1 as any).error.status });
    const b2 = await client.translate({ input: "", source: "auto", target: "en-IN" });
    note("empty input → client", b2.ok === true ? { ok: true, out: b2.data } : { ok: false, kind: (b2 as any).error.kind, status: (b2 as any).error.status });
    const rawBad = await countingFetch(`${getSarvamConfig().baseUrl}/translate`, { method: "POST", headers: { "Content-Type": "application/json", "api-subscription-key": KEY }, body: "{not json" });
    note("raw malformed JSON body (API status only)", { status: rawBad.status });
    // (c) oversized payload: (i) API limit for mayura, (ii) pipeline with a 5,000-char paste
    const big = "mujhe invoice banana hai. ".repeat(60);
    const rawBig = await countingFetch(`${getSarvamConfig().baseUrl}/translate`, { method: "POST", headers: { "Content-Type": "application/json", "api-subscription-key": KEY }, body: JSON.stringify({ input: big, source_language_code: "auto", target_language_code: "en-IN", model: "mayura:v1" }) });
    note(`oversized (${big.length} chars) to mayura directly (API status only)`, { status: rawBig.status });
    setSarvamClientForTests(client);
    clearLanguageCache();
    const huge = ("mujhe Acme Trading ke liye invoice banana hai, 45000 rupaye. ").repeat(90);
    const c = await prepareLanguageInput({ tenantId: "live-verify", rawText: huge });
    note(`pipeline with ${huge.length}-char paste`, { degraded: c.degraded, reason: c.degradedReason, chunks: c.providerCalls.length, modelTextChars: c.modelText.length, count45000: count(c.modelText, "45000") });
    // (d) forced timeout
    setSarvamClientForTests(createSarvamClient({ fetchFn: countingFetch, config: cfg(1) }));
    clearLanguageCache();
    const d = await prepareLanguageInput({ tenantId: "live-verify", rawText: "mujhe Acme Trading ke liye invoice banana hai 45001" });
    note("forced 1 ms timeout → pipeline", { degraded: d.degraded, reason: d.degradedReason, modelText: d.modelText, ms: d.totalLatencyMs });
    save("failure", rows);
  }

  // ── 7. uncached latency ─────────────────────────────────────────────────────
  if (step === "latency") {
    const n = Number(args[0] ?? 5);
    setSarvamClientForTests(createSarvamClient({ fetchFn: countingFetch, config: cfg(8000) }));
    const all: number[] = [], perLang: Record<string, number[]> = {}, reply: number[] = [];
    for (const L of LANGS) {
      perLang[L.id] = [];
      for (let i = 0; i < n; i++) {
        clearLanguageCache(); clearReplyCache();
        const text = phrase(L.id).text.replace("45000", String(45000 + i * 111 + Math.floor(Math.random() * 90)));
        const t = await prepareLanguageInput({ tenantId: "live-verify", rawText: text });
        if (t.degraded) { say(`  ! ${L.id} degraded: ${t.degradedReason}`); continue; }
        perLang[L.id].push(t.totalLatencyMs); all.push(t.totalLatencyMs);
        if (i === 0 && (t.kind === "native" || t.kind === "romanised")) {
          const t0 = Date.now(); const r = await respondInLanguage(`Question 1 of 4 · Customer\nWho is this invoice for? (${i}) ${Math.random()}`, t); if (r.translated) reply.push(Date.now() - t0);
        }
      }
      say(`  ${L.id.padEnd(9)} p50=${pct(perLang[L.id], 0.5)?.toFixed(0)}ms max=${Math.max(...perLang[L.id]).toFixed(0)}ms (n=${perLang[L.id].length})`);
    }
    const res = { n_total: all.length, p50: pct(all, 0.5), p95: pct(all, 0.95), max: Math.max(...all), reply_translation: { n: reply.length, p50: pct(reply, 0.5), max: Math.max(...reply) }, perLang: Object.fromEntries(Object.entries(perLang).map(([k, v]) => [k, { n: v.length, p50: pct(v, 0.5), p95: pct(v, 0.95), max: Math.max(...v) }])) };
    say("UNCACHED regional pipeline (input side, before the model call):", { p50: res.p50, p95: res.p95, max: res.max, n: res.n_total, budgetMs: 1500 });
    say("reply translation:", res.reply_translation);
    save("latency", res);
  }
  summary();
  save(`calls-${step}`, { count: calls.length, calls });
}
main().catch((e) => { console.error(scrub(String(e?.stack || e))); process.exit(1); });
