import fs from "fs";
import connectDB from "@/lib/db";
import HsnSacReference from "@/models/tax/HsnSacReference";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/import-hsn-sac-reference.ts ./hsn-sac-reference.csv");
  process.exit(1);
}

function splitCsv(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"" && line[i + 1] === "\"") {
      cell += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

function keywords(text: string) {
  return Array.from(new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 2)));
}

async function main() {
  const raw = fs.readFileSync(file, "utf8").trim();
  const [headerLine, ...lines] = raw.split(/\r?\n/);
  const headers = splitCsv(headerLine);
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const required = ["code", "type", "description", "gstRate", "gstTreatment", "sourceId", "effectiveFrom"];
  for (const field of required) {
    if (!(field in index)) throw new Error(`Missing required CSV column: ${field}`);
  }

  await connectDB();
  let count = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = splitCsv(line);
    const doc = {
      code: row[index.code],
      type: row[index.type],
      description: row[index.description],
      gstRate: Number(row[index.gstRate]),
      gstTreatment: row[index.gstTreatment],
      sourceId: row[index.sourceId],
      sourceName: row[index.sourceName],
      version: row[index.version],
      effectiveFrom: new Date(row[index.effectiveFrom]),
      effectiveTo: row[index.effectiveTo] ? new Date(row[index.effectiveTo]) : undefined,
      active: row[index.active] ? row[index.active] !== "false" : true,
      keywords: keywords(`${row[index.code]} ${row[index.description]}`),
    };
    await HsnSacReference.updateOne(
      { code: doc.code, type: doc.type, sourceId: doc.sourceId, effectiveFrom: doc.effectiveFrom },
      { $set: doc },
      { upsert: true, runValidators: true },
    );
    count += 1;
  }
  console.log(`Imported ${count} HSN/SAC reference rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
