export interface Currency {
  id: number;
  name: string;
  symbol: string;
  code: string;
}

export const CURRENCIES: Currency[] = [
  { id: 1, code: "INR", name: "Indian Rupee", symbol: "₹" },
  { id: 2, code: "USD", name: "US Dollar", symbol: "$" },
  { id: 3, code: "EUR", name: "Euro", symbol: "€" },
  { id: 4, code: "GBP", name: "British Pound", symbol: "£" },
  { id: 5, code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { id: 6, code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { id: 7, code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { id: 8, code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
  { id: 9, code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { id: 10, code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { id: 11, code: "CAD", name: "Canadian Dollar", symbol: "C$" },
];

export const getCurrencyById = (id: number) =>
  CURRENCIES.find((c) => c.id === id);
