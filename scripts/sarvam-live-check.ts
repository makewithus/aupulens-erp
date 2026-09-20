/**
 * LIVE smoke check of the language pipeline against the real Sarvam API. Not part of CI.
 * Usage: npx tsx scripts/sarvam-live-check.ts            (all phrases)
 *        npx tsx scripts/sarvam-live-check.ts hi-native  (one id)
 * Prints, per phrase: detected language, what the model would receive, entities protected,
 * provider calls (type / chars / ms) and whether the layer degraded.
 */
import "dotenv/config";
import { prepareLanguageInput, respondInLanguage } from "../lib/ai/language";

import { PHRASES } from "./sarvam-live-phrases";

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
