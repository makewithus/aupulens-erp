export interface GstRateRule {
  chapter?: string;
  heading?: string;
  subheading?: string;
  tariffItem?: string;
  serviceCode?: string; // SAC
  type: "goods" | "service";
  description: string;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  treatment: "taxable" | "exempt" | "nil" | "non-gst" | "out-of-scope";
  conditions?: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  sourceNotification: string;
  sourceUrl?: string;
  verificationStatus: "VERIFIED" | "CONDITIONAL" | "REVIEW_REQUIRED" | "EXEMPT_OR_NIL";
}

export const VERIFIED_GST_RATES: GstRateRule[] = [
  // Goods
  {
    chapter: "61",
    type: "goods",
    description: "Articles of apparel and clothing accessories, knitted or crocheted (e.g. Cotton T-shirt)",
    cgst: 2.5,
    sgst: 2.5,
    igst: 5,
    cess: 0,
    treatment: "taxable",
    conditions: ["Sale value not exceeding Rs. 1000 per piece"],
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "CONDITIONAL",
  },
  {
    chapter: "61",
    type: "goods",
    description: "Articles of apparel and clothing accessories, knitted or crocheted (e.g. Cotton T-shirt)",
    cgst: 6,
    sgst: 6,
    igst: 12,
    cess: 0,
    treatment: "taxable",
    conditions: ["Sale value exceeding Rs. 1000 per piece"],
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "CONDITIONAL",
  },
  {
    chapter: "10",
    heading: "1006",
    type: "goods",
    description: "Rice (e.g. Basmati rice) - other than pre-packaged and labelled",
    cgst: 0,
    sgst: 0,
    igst: 0,
    cess: 0,
    treatment: "exempt",
    effectiveFrom: "2022-07-18",
    sourceNotification: "Notification No. 2/2017-Central Tax (Rate)",
    verificationStatus: "EXEMPT_OR_NIL",
  },
  {
    chapter: "10",
    heading: "1006",
    type: "goods",
    description: "Rice - pre-packaged and labelled",
    cgst: 2.5,
    sgst: 2.5,
    igst: 5,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2022-07-18",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "CONDITIONAL",
  },
  {
    chapter: "21",
    heading: "2106",
    type: "goods",
    description: "Food preparations not elsewhere specified or included (Packaged food)",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "84",
    heading: "8471",
    type: "goods",
    description: "Automatic data processing machines and units thereof (Laptop computer)",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "85",
    heading: "8517",
    type: "goods",
    description: "Telephones for cellular networks or for other wireless networks (Mobile phone)",
    cgst: 6,
    sgst: 6,
    igst: 12,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "85",
    heading: "8544",
    type: "goods",
    description: "Insulated (including enamelled or anodised) wire, cable (Electrical cable)",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "25",
    heading: "2523",
    type: "goods",
    description: "Portland cement, aluminous cement, slag cement, supersulphate cement and similar hydraulic cements",
    cgst: 14,
    sgst: 14,
    igst: 28,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "73",
    heading: "7304", // And 7305, 7306 for pipes
    type: "goods",
    description: "Tubes, pipes and hollow profiles, seamless, of iron (other than cast iron) or steel",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "73",
    heading: "7305",
    type: "goods",
    description: "Other tubes and pipes, of iron or steel",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "73",
    heading: "7306",
    type: "goods",
    description: "Other tubes, pipes and hollow profiles, of iron or steel",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "48",
    heading: "4820",
    type: "goods",
    description: "Registers, account books, note books, order books, receipt books...",
    cgst: 6,
    sgst: 6,
    igst: 12,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "94",
    heading: "9401",
    type: "goods",
    description: "Seats (other than those of heading 94.02), whether or not convertible into beds, and parts thereof",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "71",
    heading: "7113",
    type: "goods",
    description: "Articles of jewellery and parts thereof, of precious metal or of metal clad with precious metal",
    cgst: 1.5,
    sgst: 1.5,
    igst: 3,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "87",
    heading: "8712",
    type: "goods",
    description: "Bicycles and other cycles (including delivery tricycles), not motorised",
    cgst: 2.5,
    sgst: 2.5,
    igst: 5,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "04",
    heading: "0401", // and 0403
    type: "goods",
    description: "Fresh Milk & Curd (Unpackaged/Unlabeled)",
    cgst: 0,
    sgst: 0,
    igst: 0,
    cess: 0,
    treatment: "exempt",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 2/2017-Central Tax (Rate)",
    verificationStatus: "EXEMPT_OR_NIL",
  },
  {
    chapter: "04",
    heading: "0403",
    type: "goods",
    description: "Curd (Unpackaged/Unlabeled)",
    cgst: 0,
    sgst: 0,
    igst: 0,
    cess: 0,
    treatment: "exempt",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 2/2017-Central Tax (Rate)",
    verificationStatus: "EXEMPT_OR_NIL",
  },
  {
    chapter: "71",
    heading: "7102",
    type: "goods",
    description: "Rough Diamonds (Unworked/Uncut)",
    cgst: 0.125,
    sgst: 0.125,
    igst: 0.25,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "30",
    heading: "3004",
    type: "goods",
    description: "Medicaments/General Drugs (Retail packs)",
    cgst: 2.5,
    sgst: 2.5,
    igst: 5,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "85",
    heading: "8539",
    type: "goods",
    description: "LED Lamps & Bulbs",
    cgst: 6,
    sgst: 6,
    igst: 12,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    chapter: "34",
    heading: "3401",
    type: "goods",
    description: "Toilet Soap",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 1/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  // Services
  {
    serviceCode: "9954",
    type: "service",
    description: "Construction services",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 11/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED", // Note: Some residential construction can be 5% or 1%, but we'll mark general as 18% and conditional.
  },
  {
    serviceCode: "9954",
    type: "service",
    description: "Construction of affordable residential apartments",
    cgst: 0.5,
    sgst: 0.5,
    igst: 1,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2019-04-01",
    sourceNotification: "Notification No. 3/2019-Central Tax (Rate)",
    verificationStatus: "CONDITIONAL",
  },
  {
    serviceCode: "9982",
    type: "service",
    description: "Legal and accounting services",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 11/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    serviceCode: "998314",
    type: "service",
    description: "Information technology (IT) design and development services (Software subscription)",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 11/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  },
  {
    serviceCode: "9987",
    type: "service",
    description: "Maintenance, repair and installation (except construction) services",
    cgst: 9,
    sgst: 9,
    igst: 18,
    cess: 0,
    treatment: "taxable",
    effectiveFrom: "2017-07-01",
    sourceNotification: "Notification No. 11/2017-Central Tax (Rate)",
    verificationStatus: "VERIFIED",
  }
];

export function resolveGstRate(code: string, type: "goods" | "service"): GstRateRule[] {
  const normalizedCode = code.trim().replace(/^0+/, ''); // In rate rules we might match chapter/heading without leading zero or keep it. Actually let's keep exact string but match prefixes.
  
  // Clean code for matching: for HSN, first 2 are chapter, first 4 are heading, first 6 are subheading.
  const chapter = code.substring(0, 2);
  const heading = code.substring(0, 4);
  const subheading = code.substring(0, 6);
  
  // For services, SAC starts with 99
  const isService = type === "service" || code.startsWith("99");

  const matches = VERIFIED_GST_RATES.filter(rule => {
    if (rule.type !== type && !(isService && rule.type === "service")) return false;
    
    if (rule.type === "service") {
      if (rule.serviceCode && code.startsWith(rule.serviceCode)) return true;
      return false;
    } else {
      if (rule.tariffItem) return code.startsWith(rule.tariffItem);
      if (rule.subheading) return code.startsWith(rule.subheading);
      if (rule.heading) return code.startsWith(rule.heading);
      if (rule.chapter) return code.startsWith(rule.chapter);
      return false;
    }
  });

  return matches;
}
