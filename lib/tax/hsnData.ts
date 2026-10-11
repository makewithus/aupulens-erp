import fs from "fs";
import path from "path";
import { resolveGstRate, GstRateRule } from "./gstRateMaster";

export interface HsnSacRecord {
  code: string;
  type: "goods" | "service";
  description: string;
}

export interface RankedHsnSacRecord extends HsnSacRecord {
  score: number;
  matchedTokens: string[];
  gstRate?: number;
  gstTreatment?: "taxable" | "exempt" | "nil" | "non-gst" | "out-of-scope";
  verificationStatus?: string;
  conditions?: string[];
  sourceId?: string;
  effectiveDate?: string;
  candidateAlternatives?: GstRateRule[];
}

export interface HsnSacLookupResult {
  selected: RankedHsnSacRecord | null;
  candidates: RankedHsnSacRecord[];
  confidence: "high" | "medium" | "low";
  reviewRequired: boolean;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "for", "in", "of", "or", "the", "to", "with", "other", "than", "including"
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

const HSN_SAC_DATA: HsnSacRecord[] = [
  {
    code: "85285200",
    type: "goods",
    description: "Monitors capable of directly connecting to and designed for use with an automatic data processing machine of heading 8471, including computer monitors and display monitors",
  },
  {
    code: "9401",
    type: "goods",
    description: "Seats and chairs, including swivel seats, office chairs, executive chairs, leather chairs and adjustable chairs",
  },
  {
    code: "1001",
    type: "goods",
    description: "Wheat and meslin other than pre-packaged and labelled, including fresh unbranded wheat grain",
  },
  {
    code: "4820",
    type: "goods",
    description: "Registers, account books, note books, order books, receipt books, letter pads, memorandum pads, diaries and similar articles, exercise books, blotting-pads, binders (loose-leaf or other), folders, file covers, manifold business forms, interleaved carbon sets and other articles of stationery, of paper or paperboard, hard-cover ruled notebook for writing",
  },
  {
    code: "48201010",
    type: "goods",
    description: "Registers, account books",
  },
  {
    code: "6109",
    type: "goods",
    description: "T-shirts, shirts and other vests, knitted or crocheted (Men's or Women's)",
  },
  {
    code: "4819",
    type: "goods",
    description: "Cartons, boxes, cases, bags and other packing containers, of paper, paperboard, cellulose wadding or webs of cellulose fibres (e.g. Corrugated packaging box)",
  },
  {
    code: "998311",
    type: "service",
    description: "Management consulting and management services including financial, strategic, human resources, marketing, operations and supply chain management",
  },
  {
    code: "998222",
    type: "service",
    description: "Accounting and bookkeeping consultancy services",
  },
  {
    code: "99822",
    type: "service",
    description: "Accounting, auditing and bookkeeping services",
  },
  {
    code: "998314",
    type: "service",
    description: "Information technology (IT) design and development services (Software development service)",
  }
];

// Lazy load the huge datasets
let _masterHsnSac: HsnSacRecord[] | null = null;
function getMasterData(): HsnSacRecord[] {
  if (_masterHsnSac) return _masterHsnSac;
  try {
    const dataPath = path.join(process.cwd(), "hsn/master_hsn_sac.json");
    const raw = fs.readFileSync(dataPath, "utf-8");
    const parsed = JSON.parse(raw);
    
    // Create a map of rich descriptions from our legacy HSN_SAC_DATA
    const richDescMap = new Map(HSN_SAC_DATA.map(item => [item.code, item.description]));
    
    _masterHsnSac = parsed.map((p: any) => ({
      code: p.code,
      description: richDescMap.has(p.code) ? `${p.desc} ${richDescMap.get(p.code)}` : p.desc,
      type: p.type === "services" || p.type === "service" ? "service" : "goods"
    }));
    
    // Add any from HSN_SAC_DATA that weren't in master data just in case
    for (const legacy of HSN_SAC_DATA) {
      if (!_masterHsnSac.find(m => m.code === legacy.code)) {
        _masterHsnSac.push(legacy);
      }
    }
  } catch (e) {
    console.error("Failed to load master_hsn_sac.json", e);
    _masterHsnSac = [];
  }
  return _masterHsnSac;
}

function scoreRecord(record: HsnSacRecord, tokens: string[]): RankedHsnSacRecord {
  const desc = record.description.toLowerCase();
  const matchedTokens: string[] = [];
  let score = 0;
  for (const token of tokens) {
    if (record.code === token) {
      score += 50;
      matchedTokens.push(token);
    } else if (/^\d+$/.test(token) && token.length >= 4 && record.code.includes(token)) {
      score += 20;
      matchedTokens.push(token);
    } else if (desc.includes(token)) {
      score += token.length >= 5 ? 5 : 2;
      matchedTokens.push(token);
    }
  }
  return { ...record, score, matchedTokens: Array.from(new Set(matchedTokens)) };
}

function applyRateRules(candidate: RankedHsnSacRecord): RankedHsnSacRecord {
  const rules = resolveGstRate(candidate.code, candidate.type);
  if (rules.length === 0) {
    return {
      ...candidate,
      gstRate: undefined,
      gstTreatment: undefined,
      verificationStatus: "UNRESOLVED",
    };
  }

  // Sort rules to find the most specific/applicable one (defaulting to the first if multiple or conditional)
  const defaultRule = rules[0];
  const isConditional = rules.some(r => r.verificationStatus === "CONDITIONAL") || rules.length > 1;

  return {
    ...candidate,
    gstRate: defaultRule.igst,
    gstTreatment: defaultRule.treatment,
    verificationStatus: isConditional ? "CONDITIONAL" : defaultRule.verificationStatus,
    conditions: defaultRule.conditions,
    sourceId: defaultRule.sourceNotification,
    effectiveDate: defaultRule.effectiveFrom,
    candidateAlternatives: rules.length > 1 ? rules : undefined,
  };
}

export function searchHsnSac(query: string, type?: "goods" | "service"): RankedHsnSacRecord[] {
  const normalizedQuery = query.toLowerCase();
  const tokens = tokenize(normalizedQuery);
  if (tokens.length === 0) return [];
  
  const allData = getMasterData();
  
  const scored = allData.map((item) => {
    if (type && item.type !== type) return null;
    return scoreRecord(item, tokens);
  }).filter((item): item is RankedHsnSacRecord => !!item && item.score > 0);
  
  scored.sort((a, b) => b.score - a.score || b.code.length - a.code.length);
  
  return scored.slice(0, 10).map(applyRateRules);
}

export function findHsnSacReference(code: string, type?: "goods" | "service"): RankedHsnSacRecord | undefined {
  const normalized = String(code || "").trim();
  const allData = getMasterData();
  const exact = allData.find((record) => record.code === normalized && (!type || record.type === type));
  if (exact) {
    return applyRateRules({ ...exact, score: 100, matchedTokens: [normalized] });
  }
  return undefined;
}

export function lookupHsnSac(description: string, type?: "goods" | "service", hsnCode?: string): HsnSacLookupResult {
  const hasDesc = !!description.trim();
  let hsnRef: RankedHsnSacRecord | undefined;
  
  if (hsnCode) {
    hsnRef = findHsnSacReference(hsnCode, type);
  }

  // Exact reverse lookup scenario (only HSN provided)
  if (hsnRef && !hasDesc) {
    return {
      selected: hsnRef,
      candidates: [hsnRef],
      confidence: "high",
      reviewRequired: hsnRef.verificationStatus !== "VERIFIED" && hsnRef.verificationStatus !== "EXEMPT_OR_NIL",
    };
  }

  // Description search
  const candidates = hasDesc ? searchHsnSac(description, type) : [];
  
  // If BOTH are provided, they might conflict!
  if (hsnRef && hasDesc) {
    const index = candidates.findIndex(c => c.code === hsnRef!.code);
    if (index !== -1) {
      if (index > 0) {
        candidates.splice(index, 1);
        candidates.unshift(hsnRef);
      }
    } else {
      candidates.unshift(hsnRef);
    }
    
    // Force review so the user can choose which source of truth they intended
    return {
      selected: candidates[0],
      candidates,
      confidence: "low",
      reviewRequired: true
    };
  }

  // Standard description search
  const selected = candidates[0] || null;
  if (!selected) {
    return { selected: null, candidates: [], confidence: "low", reviewRequired: true };
  }

  const secondScore = candidates[1]?.score || 0;
  const ambiguous = secondScore > 0 && selected.score - secondScore <= 5;
  const confidence =
    selected.score >= 10 && !ambiguous
      ? "high"
      : selected.score >= 5
        ? "medium"
        : "low";

  const rateUncertain = selected.verificationStatus !== "VERIFIED" && selected.verificationStatus !== "EXEMPT_OR_NIL";

  return {
    selected,
    candidates,
    confidence,
    reviewRequired: confidence !== "high" || ambiguous || rateUncertain,
  };
}
