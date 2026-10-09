export interface HsnSacRecord {
  code: string;
  type: "goods" | "service";
  description: string;
  gstRate: number;
  gstTreatment: "taxable" | "exempt" | "nil" | "non-gst" | "out-of-scope";
  sourceId?: string;
  effectiveDate?: string;
}

export const HSN_SAC_DATA: HsnSacRecord[] = [
  {
    code: "85285200",
    type: "goods",
    description: "Monitors capable of directly connecting to and designed for use with an automatic data processing machine of heading 8471, including computer monitors and display monitors",
    gstRate: 18,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-85285200",
    effectiveDate: "2026-04-01",
  },
  {
    code: "9401",
    type: "goods",
    description: "Seats and chairs, including swivel seats, office chairs, executive chairs, leather chairs and adjustable chairs",
    gstRate: 18,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-9401",
    effectiveDate: "2026-04-01",
  },
  {
    code: "1001",
    type: "goods",
    description: "Wheat and meslin other than pre-packaged and labelled, including fresh unbranded wheat grain",
    gstRate: 0,
    gstTreatment: "exempt",
    sourceId: "gst-in-reference-1001",
    effectiveDate: "2026-04-01",
  },
  {
    code: "4820",
    type: "goods",
    description: "Registers, account books, note books, order books, receipt books, letter pads, memorandum pads, diaries and similar articles, exercise books, blotting-pads, binders (loose-leaf or other), folders, file covers, manifold business forms, interleaved carbon sets and other articles of stationery, of paper or paperboard",
    gstRate: 0,
    gstTreatment: "nil", // 0% could be nil or taxable at 0%, assuming nil as per example
    sourceId: "gst-in-reference-4820",
    effectiveDate: "2026-04-01",
  },
  {
    code: "48201010",
    type: "goods",
    description: "Registers, account books",
    gstRate: 12,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-48201010",
    effectiveDate: "2026-04-01",
  },
  {
    code: "6109",
    type: "goods",
    description: "T-shirts, shirts and other vests, knitted or crocheted (Men's or Women's)",
    gstRate: 5,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-6109",
    effectiveDate: "2026-04-01",
  },
  {
    code: "4819",
    type: "goods",
    description: "Cartons, boxes, cases, bags and other packing containers, of paper, paperboard, cellulose wadding or webs of cellulose fibres (e.g. Corrugated packaging box)",
    gstRate: 18,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-4819",
    effectiveDate: "2026-04-01",
  },
  {
    code: "998311",
    type: "service",
    description: "Management consulting and management services including financial, strategic, human resources, marketing, operations and supply chain management",
    gstRate: 18,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-998311",
    effectiveDate: "2026-04-01",
  },
  {
    code: "998222",
    type: "service",
    description: "Accounting and bookkeeping services",
    gstRate: 18,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-998222",
    effectiveDate: "2026-04-01",
  },
  {
    code: "99822",
    type: "service",
    description: "Accounting, auditing and bookkeeping services",
    gstRate: 18,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-99822",
    effectiveDate: "2026-04-01",
  },
  {
    code: "998314",
    type: "service",
    description: "Information technology (IT) design and development services (Software development service)",
    gstRate: 18,
    gstTreatment: "taxable",
    sourceId: "gst-in-reference-998314",
    effectiveDate: "2026-04-01",
  }
];

export interface RankedHsnSacRecord extends HsnSacRecord {
  score: number;
  matchedTokens: string[];
}

export interface HsnSacLookupResult {
  selected: RankedHsnSacRecord | null;
  candidates: RankedHsnSacRecord[];
  confidence: "high" | "medium" | "low";
  reviewRequired: boolean;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "or",
  "the",
  "to",
  "with",
]);

export function normalizeProductType(type?: string): "goods" | "service" | undefined {
  if (!type) return undefined;
  const normalized = type.toLowerCase().trim();
  if (["service", "services", "sac"].includes(normalized)) return "service";
  if (["goods", "good", "product", "products", "consu", "stockable", "combo", "hsn"].includes(normalized)) return "goods";
  return undefined;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function scoreRecord(record: HsnSacRecord, tokens: string[]): RankedHsnSacRecord {
  const desc = record.description.toLowerCase();
  const matchedTokens: string[] = [];
  let score = 0;
  for (const token of tokens) {
    if (record.code === token) {
      score += 20;
      matchedTokens.push(token);
    } else if (/^\d+$/.test(token) && token.length >= 4 && record.code.includes(token)) {
      score += 8;
      matchedTokens.push(token);
    } else if (desc.includes(token)) {
      score += token.length >= 5 ? 3 : 1;
      matchedTokens.push(token);
    }
  }
  return { ...record, score, matchedTokens: Array.from(new Set(matchedTokens)) };
}

export function searchHsnSac(query: string, type?: "goods" | "service"): RankedHsnSacRecord[] {
  const normalizedQuery = query.toLowerCase();
  const tokens = tokenize(normalizedQuery);
  if (tokens.length === 0) return [];
  
  return HSN_SAC_DATA.map((item) => {
    if (type && item.type !== type) return false;
    return scoreRecord(item, tokens);
  })
    .filter((item): item is RankedHsnSacRecord => !!item && item.score > 0)
    .sort((a, b) => b.score - a.score || b.code.length - a.code.length);
}

export function lookupHsnSac(description: string, type?: "goods" | "service"): HsnSacLookupResult {
  const candidates = searchHsnSac(description, type).slice(0, 5);
  const selected = candidates[0] || null;
  if (!selected) {
    return { selected: null, candidates: [], confidence: "low", reviewRequired: true };
  }

  const secondScore = candidates[1]?.score || 0;
  const ambiguous = secondScore > 0 && selected.score - secondScore <= 1;
  const confidence =
    selected.score >= 8 && !ambiguous
      ? "high"
      : selected.score >= 4 && !ambiguous
        ? "medium"
        : "low";

  return {
    selected,
    candidates,
    confidence,
    reviewRequired: confidence !== "high" || ambiguous,
  };
}

export function findHsnSacReference(code: string, type?: "goods" | "service"): HsnSacRecord | undefined {
  const normalized = String(code || "").trim();
  return HSN_SAC_DATA.find((record) => record.code === normalized && (!type || record.type === type));
}
