/**
 * LIVE smoke check of the language pipeline against the real Sarvam API. Not part of CI.
 * Usage: npx tsx scripts/sarvam-live-check.ts            (all phrases)
 *        npx tsx scripts/sarvam-live-check.ts hi-native  (one id)
 * Prints, per phrase: detected language, what the model would receive, entities protected,
 * provider calls (type / chars / ms) and whether the layer degraded.
 */
import "dotenv/config";
import { prepareLanguageInput, respondInLanguage } from "../lib/ai/language";

const PHRASES: { id: string; text: string; expect: string }[] = [
  { id: "hi-native", text: "Acme के लिए 45000 रुपये का इनवॉइस बनाओ", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "hi-roman", text: "Acme ke liye 45000 rupaye ka invoice banao", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "ta", text: "Acme க்கு 45000 ரூபாய்க்கு இன்வாய்ஸ் உருவாக்கு", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "te", text: "Acme కోసం 45000 రూపాయలకు ఇన్వాయిస్ సృష్టించండి", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "mr", text: "Acme साठी 45000 रुपयांचे बीजक तयार करा", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "bn", text: "Acme এর জন্য 45000 টাকার ইনভয়েস তৈরি করুন", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "gu", text: "Acme માટે 45000 રૂપિયાનું ઇન્વોઇસ બનાવો", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "kn", text: "Acme ಗಾಗಿ 45000 ರೂಪಾಯಿಗಳ ಇನ್ವಾಯ್ಸ್ ರಚಿಸಿ", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "ml", text: "Acme നായി 45000 രൂപയുടെ ഇൻവോയ്സ് സൃഷ്ടിക്കുക", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "pa", text: "Acme ਲਈ 45000 ਰੁਪਏ ਦਾ ਇਨਵੌਇਸ ਬਣਾਓ", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "or", text: "Acme ପାଇଁ 45000 ଟଙ୍କାର ଇନଭଏସ୍ ତିଆରି କର", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "code-mixed", text: "invoice banao for Acme, amount 45000 rupees", expect: "Create an invoice for Acme, amount 45000 rupees" },
  { id: "protected-typo-lookalike", text: "Recipt Traders ke liye invoice banao, INV-0O42 ki copy bhejo", expect: "…Recipt Traders… and INV-0O42 must appear VERBATIM (not 'Receipt', not 'INV-0042')" },
  { id: "deliberate-typo-quoted", text: 'item ka naam "Reciept Pad" rakho', expect: 'Name the item "Reciept Pad" — quoted text verbatim' },
  { id: "deliberate-typo-unquoted-titlecase", text: "naya product banao Invoce Pad 250 rupaye", expect: "…Invoce Pad… kept (capitalised proper noun mid-sentence)" },
  { id: "unquoted-lowercase-typo", text: "create an invoce pad for 250", expect: "Rewritten to 'invoice'; reply must open 'I understood this as: …'" },
  { id: "number-formats", text: "1,00,000 ka invoice banao Acme ke liye, due agle mangalwar", expect: "Create invoice of 100000 for Acme, due next Tuesday" },
  { id: "number-words-en", text: "invoice for Acme forty five thousand rupees", expect: "45000 (no provider call: English)" },
  { id: "unsupported", text: "请给客户创建发票", expect: "degraded: unsupported_language, original text passed through" },
];

async function main() {
  const only = process.argv[2];
  console.log(`SARVAM key present: ${Boolean(process.env.SARVAM_API_KEY)}  enabled: ${process.env.SARVAM_ENABLED ?? "true"}\n`);
  for (const p of PHRASES.filter((x) => !only || x.id === only)) {
    const t = await prepareLanguageInput({ tenantId: "live-check", rawText: p.text });
    console.log(`── ${p.id}`);
    console.log(`  typed    : ${p.text}`);
    console.log(`  language : ${t.detectedLanguage} (${t.script}, ${t.kind}, conf ${t.confidence.toFixed(2)})`);
    console.log(`  model got: ${t.modelText}`);
    console.log(`  expected : ${p.expect}`);
    console.log(`  protected: ${t.entitiesProtected.map((e) => `${e.type}:${e.value}`).join(" | ") || "-"}`);
    console.log(`  rewrites : ${t.rewrites.join(", ") || "-"}`);
    console.log(`  calls    : ${t.providerCalls.map((c) => `${c.type}/${c.model ?? "-"} ${c.characters}ch ${c.latencyMs}ms ${c.ok ? "ok" : "FAIL:" + c.error}`).join("; ") || "none"}`);
    console.log(`  degraded : ${t.degraded ? t.degradedReason : "no"}   lowConfidence: ${t.lowConfidence}   total ${t.totalLatencyMs}ms`);
    if (!t.degraded && (t.kind === "native" || t.kind === "romanised")) {
      const r = await respondInLanguage("Open **Sales > Invoices** and find INV-2024-0042 for Acme, total 45000.", t);
      console.log(`  reply    : ${r.text.replace(/\n/g, " ⏎ ")}${r.translated ? "" : "   (NOT translated: " + (r.degradedReason ?? "n/a") + ")"}`);
    }
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
