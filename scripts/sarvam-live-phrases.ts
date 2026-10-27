/** Phrases shared by the live scripts (AI-written; each needs native-speaker confirmation). */
export const PHRASES: { id: string; text: string; expect: string }[] = [
  { id: "hi-native", text: "Acme के लिए 45000 रुपये का इनवॉइस बनाओ", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "hi-roman", text: "Acme ke liye 45000 rupaye ka invoice banao", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "ta", text: "Acme க்கு 45000 ரூபாய்க்கு இன்வாய்ஸ் உருவாக்கு", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "te", text: "Acme కోసం 45000 రూపాయలకు ఇన్వాయిస్ సృష్టించండి", expect: "Create an invoice for Acme for 45000 rupees" },
  { id: "mr", text: "Acme साठी 45000 रुपयांचे बीजक तयार करा", expect: "Create an invoice for Acme for 45000 rupees" },
  // Added AFTER the live run showed 'बीजक' (an older Marathi word for invoice) is translated as "seed": the original mr phrase stays as observed.
  { id: "mr-alt", text: "Acme साठी 45000 रुपयांचे इनव्हॉइस तयार करा", expect: "Create an invoice for Acme for 45000 rupees" },
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
