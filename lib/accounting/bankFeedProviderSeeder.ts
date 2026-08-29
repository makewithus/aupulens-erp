import BankFeedProvider from "@/models/finance/BankFeedProvider";

const PARTNER_BANKS = [
  "Standard Chartered",
  "HSBC",
  "Kotak Mahindra Bank",
  "State Bank of India",
  "Axis Bank",
];

const AGGREGATOR_BANKS: { name: string; supportsCreditCard?: boolean }[] = [
  { name: "PayPal" },
  { name: "ICICI Bank (India)" },
  { name: "HDFC Bank (India)" },
  { name: "State Bank of India (India) - Banking" },
  { name: "Kotak Mahindra Bank (India)" },
  { name: "Axis Bank (India)" },
  { name: "HDFC Bank (India) - Credit Card", supportsCreditCard: true },
  { name: "State Bank of India Credit Cards (India)", supportsCreditCard: true },
  { name: "American Express Cards (India)", supportsCreditCard: true },
];

/** Idempotent — safe to call on every request that reads the provider catalog. */
export async function seedBankFeedProviders(): Promise<void> {
  const existing = await BankFeedProvider.countDocuments();
  if (existing > 0) return;

  const ops = [
    ...PARTNER_BANKS.map((name, i) => ({
      updateOne: {
        filter: { name },
        update: {
          $setOnInsert: {
            name,
            type: "partner_direct" as const,
            supportsCreditCard: false,
            country: "IN",
            isActive: true,
            sortOrder: i,
          },
        },
        upsert: true,
      },
    })),
    ...AGGREGATOR_BANKS.map((b, i) => ({
      updateOne: {
        filter: { name: b.name },
        update: {
          $setOnInsert: {
            name: b.name,
            type: "aggregator" as const,
            supportsCreditCard: !!b.supportsCreditCard,
            country: "IN",
            isActive: true,
            sortOrder: i,
          },
        },
        upsert: true,
      },
    })),
  ];

  await BankFeedProvider.bulkWrite(ops, { ordered: false });
}
