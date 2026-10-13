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

// Lazy load and in-memory index for the dataset
let _masterHsnSac: HsnSacRecord[] | null = null;
let _lowerDescs: string[] = [];
let _codeMap: Map<string, HsnSacRecord[]> = new Map();
let _tokenInvertedIndex: Map<string, number[]> = new Map();

// Bounded LRU cache for search results (max 500 entries)
const MAX_CACHE_ENTRIES = 500;
const _searchCache = new Map<string, RankedHsnSacRecord[]>();

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

    // Build indexes for fast lookups
    _codeMap = new Map();
    _tokenInvertedIndex = new Map();
    _lowerDescs = new Array(_masterHsnSac.length);

    for (let i = 0; i < _masterHsnSac.length; i++) {
      const item = _masterHsnSac[i];
      const lower = item.description.toLowerCase();
      _lowerDescs[i] = lower;

      // Code map
      const existing = _codeMap.get(item.code);
      if (existing) {
        existing.push(item);
      } else {
        _codeMap.set(item.code, [item]);
      }

      // Token inverted index
      const itemTokens = new Set([...tokenize(lower), item.code.toLowerCase()]);
      for (const t of itemTokens) {
        const list = _tokenInvertedIndex.get(t);
        if (list) {
          list.push(i);
        } else {
          _tokenInvertedIndex.set(t, [i]);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load master_hsn_sac.json", e);
    _masterHsnSac = [];
    _lowerDescs = [];
    _codeMap = new Map();
    _tokenInvertedIndex = new Map();
  }
  return _masterHsnSac;
}

function scoreRecordWithIndex(record: HsnSacRecord, lowerDesc: string, tokens: string[]): RankedHsnSacRecord {
  const matchedTokens: string[] = [];
  let score = 0;
  for (const token of tokens) {
    if (record.code === token) {
      score += 50;
      matchedTokens.push(token);
    } else if (/^\d+$/.test(token) && token.length >= 4 && record.code.includes(token)) {
      score += 20;
      matchedTokens.push(token);
    } else if (lowerDesc.includes(token)) {
      score += token.length >= 5 ? 5 : 2;
      matchedTokens.push(token);
    }
  }
  return { ...record, score, matchedTokens: Array.from(new Set(matchedTokens)) };
}

function scoreRecord(record: HsnSacRecord, tokens: string[]): RankedHsnSacRecord {
  return scoreRecordWithIndex(record, record.description.toLowerCase(), tokens);
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
  const normalizedQuery = query.toLowerCase().trim();
  const tokens = tokenize(normalizedQuery);
  if (tokens.length === 0) return [];

  // Check bounded cache
  const cacheKey = `${type || "all"}:${normalizedQuery}`;
  const cached = _searchCache.get(cacheKey);
  if (cached) return cached;
  
  const allData = getMasterData();
  
  // Fast candidate discovery via token inverted index
  const candidateIndices = new Set<number>();
  for (const token of tokens) {
    const directMatches = _tokenInvertedIndex.get(token);
    if (directMatches) {
      for (const idx of directMatches) candidateIndices.add(idx);
    }
    // For numeric tokens >= 4, check code substrings
    if (/^\d+$/.test(token) && token.length >= 4) {
      for (const [code, items] of _codeMap.entries()) {
        if (code.includes(token)) {
          for (const item of items) {
            const idx = allData.indexOf(item);
            if (idx >= 0) candidateIndices.add(idx);
          }
        }
      }
    }
  }

  // If candidate index found matches, score only candidates
  let scored: RankedHsnSacRecord[];
  if (candidateIndices.size > 0) {
    scored = [];
    for (const idx of candidateIndices) {
      const item = allData[idx];
      if (type && item.type !== type) continue;
      const sr = scoreRecordWithIndex(item, _lowerDescs[idx], tokens);
      if (sr.score > 0) scored.push(sr);
    }
  } else {
    // Fallback full scan if tokens don't match index (e.g. partial substrings)
    scored = allData.map((item, idx) => {
      if (type && item.type !== type) return null;
      return scoreRecordWithIndex(item, _lowerDescs[idx], tokens);
    }).filter((item): item is RankedHsnSacRecord => !!item && item.score > 0);
  }
  
  scored.sort((a, b) => b.score - a.score || b.code.length - a.code.length);
  
  const result = scored.slice(0, 10).map(applyRateRules);

  // Store in bounded cache
  if (_searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = _searchCache.keys().next().value;
    if (oldestKey) _searchCache.delete(oldestKey);
  }
  _searchCache.set(cacheKey, result);

  return result;
}

export function findHsnSacReference(code: string, type?: "goods" | "service"): RankedHsnSacRecord | undefined {
  const normalized = String(code || "").trim();
  getMasterData();
  const candidates = _codeMap.get(normalized);
  if (candidates && candidates.length > 0) {
    const exact = candidates.find((record) => !type || record.type === type);
    if (exact) {
      return applyRateRules({ ...exact, score: 100, matchedTokens: [normalized] });
    }
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
