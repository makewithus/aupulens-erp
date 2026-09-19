/**
 * A tiny MOCK of the Sarvam API for browser QA (no live provider, no key). Speaks the same shapes as
 * client.ts expects: POST /translate, /transliterate, /text-lid with header `api-subscription-key`.
 * Translation is a word-level dictionary that preserves the ZXQnZXQ placeholders and digits, like a
 * well-behaved provider; English→regional replies get a visible "[hi] "/"[ta] " marker so a tester can SEE that
 * the reply went through the translation stage. Set MOCK_SARVAM_MODE=mangle to drop placeholders (tests degrade).
 *   SARVAM_API_KEY=mock-key SARVAM_API_BASE_URL=http://127.0.0.1:4010 npx tsx scripts/qa-mock-sarvam.ts
 */
import http from "node:http";
import fs from "node:fs";

const KEY = process.env.MOCK_SARVAM_KEY || "mock-key";
const LOG = process.env.MOCK_SARVAM_LOG;
const RULES: [RegExp, string][] = [
  [/இன்வாய்ஸ் போடுங்க|invoice podunga|mujhe invoice banana hai|मुझे इनवॉइस बनाना है/gi, "create an invoice"],
  [/(\S+) ke liye invoice banao/gi, "create an invoice for $1"],
  [/(\S+) ke liye/gi, "for $1"],
  [/(\S+) க்கு இன்வாய்ஸ்/g, "create an invoice for $1"],
  [/agle mangalwar/gi, "next Tuesday"],
  [/\bhaan\b|ஆம்/gi, "yes"],
  [/\bnahi\b|இல்லை/gi, "no"],
  [/रद्द करो|ரத்து/g, "cancel"],
  [/mera balance kya hai/gi, "what is my balance"],
];
const tr = (s: string) => RULES.reduce((a, [rx, to]) => a.replace(rx, to), s);
const langOf = (c: string) => c.slice(0, 2);

http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const send = (status: number, json: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };
    if (req.headers["api-subscription-key"] !== KEY) return send(403, { error: { message: "invalid key", code: "forbidden" } });
    let j: any = {};
    try { j = JSON.parse(body || "{}"); } catch { return send(400, { error: { message: "bad json" } }); }
    if (LOG) fs.appendFileSync(LOG, JSON.stringify({ path: req.url, source: j.source_language_code, target: j.target_language_code, chars: (j.input || "").length }) + "\n");
    if (req.url === "/translate") {
      const toEnglish = j.target_language_code === "en-IN";
      let out = toEnglish ? tr(j.input) : `[${langOf(j.target_language_code)}] ${j.input}`;
      if (process.env.MOCK_SARVAM_MODE === "mangle") out = out.replace(/ZXQ\d+ZXQ/g, "");
      return send(200, { request_id: "mock", translated_text: out, source_language_code: j.source_language_code === "auto" ? (/[஀-௿]/.test(j.input) ? "ta-IN" : "hi-IN") : j.source_language_code });
    }
    if (req.url === "/transliterate") return send(200, { request_id: "mock", transliterated_text: j.input, source_language_code: j.source_language_code });
    if (req.url === "/text-lid") return send(200, { request_id: "mock", language_code: /[஀-௿]/.test(j.input) ? "ta-IN" : "hi-IN", script_code: "Latn" });
    return send(404, { error: { message: "not found" } });
  });
}).listen(Number(process.env.MOCK_SARVAM_PORT || 4010), "127.0.0.1", () => console.log("mock sarvam on :" + (process.env.MOCK_SARVAM_PORT || 4010)));
