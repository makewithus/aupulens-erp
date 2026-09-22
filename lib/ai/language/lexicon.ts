/**
 * Small, deliberate word lists. Detection is heuristic and must stay cheap (<1ms); anything
 * ambiguous is handed to the provider (`auto` source language) rather than guessed here.
 * Only DISTINCTIVE Roman-script Indic words are listed — words that are also common English
 * words (to, me, hi, do, the, is, in, on, he) are deliberately excluded.
 */
import { LANGUAGE_CODE, type LanguageCode } from "@/lib/constants/statuses";

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

export const ENGLISH_WORDS = words(`
a an the and or but if then else for of to in on at by with from into over under about as is are was were be been being am
i you he she it we they me my mine your yours his her hers our ours their them us this that these those there here
do does did done doing have has had having will would shall should can could may might must not no yes ok okay please
create add new make generate draft prepare register enter mark show list get find search open view update edit delete remove cancel send
invoice invoices bill bills receipt customer customers vendor vendors supplier payment payments amount total due date days day week month year today tomorrow yesterday next last
quote quotation order orders sales sale purchase expense expenses ledger journal account accounts balance report reports statement tax gst item items product products qty quantity price rate revenue profit profits loss losses income turnover margin cashflow
pan tan gstin hsn sku tds tcs upi neft rtgs imps ifsc
employee employees salary attendance leave inventory stock warehouse delivery budget lead leads opportunity case task project
how what when where why which who whom whose much many more less all any some every each other another same different
want need like would help tell explain steps step screen field fields form record records name number code address phone email
rupees rupee rs inr lakh lakhs crore crores thousand hundred million paid unpaid pending overdue draft status
one two three four five six seven eight nine ten twenty thirty forty fifty sixty seventy eighty ninety zero
monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december
also just very too so than because while after before until since during between through
good great thanks thank hello hey dear regards kindly
set change go back skip done finish confirm yes no correct wrong right left
`);

/** Distinctive Roman-script words per language. Longest-first matching is not needed — token lookup. */
export const ROMAN_INDIC_WORDS: Record<string, Set<string>> = {
  [LANGUAGE_CODE.HINDI]: words(`
haan ji mujhe mujhko mera meri mere hamara hamari hum aap aapka aapki tum tumhara tera teri hai hain tha thi hoga hogi hoon nahi nahin
kya kyun kyon kaise kaisa kab kahan kaun kitna kitni kitne kis
banao banana banani banaye banaiye bana banado karo karna karni kariye kar kardo kijiye
dikhao dikhana dikha bhejo bhejna bhej bhijwao dena dedo do_ lena lelo chahiye chahie chahta chahti
ke_liye liye ke ka ki ko se mein main_ par aur ya lekin agar toh magar
paise paisa rupaye rupay hazaar hazar lakh_ karod
agle agla agli pichhle pichle mangalwar somwar budhwar guruwar shukrawar shanivar ravivar kal aaj parso
bakaya baki baaki bhugtan grahak khata hisab hisaab bikri kharid kharcha
kam zyada jyada se mein saare sabhi dijiye dijie dikhaiye dikhaye batao bataiye kitne kitna kitni wala wali wale tak abhi sirf pachchis pachas pachaas sau bhi
pichhale pichhla pichhli ek hua hui hue huya huyi saal varsh baras mahina mahine mahiney hafta hafte din
dhanyavaad shukriya kripya zara zaroor bilkul theek thik accha acha
  `),
  [LANGUAGE_CODE.TAMIL]: words(`
podunga podungal poduga seiyunga venum vendum pannu pannunga pannanum panni seiyavum seyyavum enna eppadi yenna irukku irukkum illai illa
naan nan enakku unakku ungalukku avanga ivanga romba sollunga sollu kaattu kaatunga kodunga kudunga
vaanga vangi vittru nalla seri sari innaikku naalai neethu
  `),
  [LANGUAGE_CODE.TELUGU]: words(`
kavali kaavali cheyyi cheyandi chey cheppu cheppandi undi unnayi ledu ela enti emiti nenu meeru naaku meeku
chupinchu pampu ivvandi ivvu chala baagundi ippudu repu ninna
  `),
  [LANGUAGE_CODE.MARATHI]: words(`
pahije pahijet kara karaa karun aahe aahet nahi_ mala tumhi tumhala amhi kay kasa kashi kuthe kadhi
dakhva dakhav pathva pathav dya dhya mhanje aaj_ udya kal_ bharaa
  `),
  [LANGUAGE_CODE.BENGALI]: words(`
korun koro korte lagbe lagche ami amar tumi apnar apni ache achhe nei ki keno kothay kokhon
dekhao pathao dao din_ taka dhonnobad
  `),
  [LANGUAGE_CODE.GUJARATI]: words(`
mane joie joiye karo_ kari kem cho chhe nathi tamne tamari maru mari amne
batavo moklo aapo ne_ mate
  `),
  [LANGUAGE_CODE.KANNADA]: words(`
beku bekku maadi madi maadu illa idhe ide enu hege nanage nimage naanu neevu
torisi kodi kalisi ivattu naale
  `),
  [LANGUAGE_CODE.MALAYALAM]: words(`
venam venamennu cheyyu cheyyuka undu illa entha enthu engane njan ente ningal ningalude
kaanikku kaanikkuka tharu ayakku innu nale
  `),
  [LANGUAGE_CODE.PUNJABI]: words(`
chahida chahidi karo_ dasso dass vekho sanu tuhanu tusi assi haiga hunda ki_ kiven kithe
paisa_ ghalo dedo_ ajj kal_
  `),
  [LANGUAGE_CODE.ODIA]: words(`
dorkar karantu mo mora tume aame achhi nahin_ kana kemiti kouthi
dekhantu pathantu dianta aji kali
  `),
};

// Words in the tables above ending in "_" are documentation markers for words shared with
// English/other languages; strip them so they never match.
for (const set of Object.values(ROMAN_INDIC_WORDS)) {
  for (const w of [...set]) if (w.endsWith("_")) set.delete(w);
}

export const ROMAN_LOOKUP: Map<string, LanguageCode> = (() => {
  const m = new Map<string, LanguageCode>();
  for (const [lang, set] of Object.entries(ROMAN_INDIC_WORDS)) {
    for (const w of set) if (!m.has(w)) m.set(w, lang as LanguageCode);
  }
  return m;
})();

/** Devanagari markers to split Hindi vs Marathi cheaply. */
export const MARATHI_DEVANAGARI = new Set(
  "आहे आहेत नाही पाहिजे करा मला तुम्ही साठी काय कसा कशी आणि तुमचा माझा".split(" "),
);
export const HINDI_DEVANAGARI = new Set(
  "है हैं नहीं चाहिए करो कीजिए मुझे आप के लिए क्या कैसे और मेरा आपका बनाओ बनाना".split(" "),
);

/** Domain misspellings -> canonical. Applied to whole lowercase tokens only, outside entities. */
export const DOMAIN_MISSPELLINGS: Record<string, string> = {
  invce: "invoice", invoce: "invoice", invoise: "invoice", invioce: "invoice", inovice: "invoice",
  invocie: "invoice", invoic: "invoice", invoive: "invoice", invice: "invoice",
  recipt: "receipt", reciept: "receipt", receit: "receipt", reciept_: "receipt",
  gstn: "GSTIN", gstin: "GSTIN",
  custmer: "customer", costumer: "customer", custommer: "customer", cutomer: "customer", custmor: "customer",
  vender: "vendor", vendr: "vendor", suplier: "supplier", suppler: "supplier",
  paymnt: "payment", paymet: "payment", peyment: "payment",
  amout: "amount", ammount: "amount", amonut: "amount", amnt: "amount",
  quotaion: "quotation", qoutation: "quotation", quatation: "quotation",
  expence: "expense", expnse: "expense", ledgr: "ledger", balence: "balance", balnce: "balance",
  statment: "statement", salry: "salary", employe: "employee", emploee: "employee",
  attendence: "attendance", inventry: "inventory", inventary: "inventory",
  purchse: "purchase", purchace: "purchase", delivary: "delivery", warehose: "warehouse",
};

/** Vocabulary for the guarded fuzzy pass (typos not in the table above). */
export const DOMAIN_VOCAB = [
  "invoice", "customer", "vendor", "supplier", "payment", "receipt", "amount", "quotation",
  "expense", "purchase", "ledger", "balance", "statement", "salary", "employee", "attendance",
  "inventory", "product", "delivery", "warehouse", "journal", "budget",
];

/** Small English number words for the "forty five thousand" case. */
export const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
export const NUMBER_SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000,
  crore: 10_000_000, crores: 10_000_000, million: 1_000_000,
};
