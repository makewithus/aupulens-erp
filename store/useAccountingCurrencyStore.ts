import { create } from "zustand";

export interface EnabledCurrency {
  code: string;
  symbol: string;
  name: string;
  exchangeRate?: number;
}

interface AccountingCurrencyStore {
  baseCurrency: string;
  baseCurrencySymbol: string;
  enabledCurrencies: EnabledCurrency[];
  hydrated: boolean;
  loading: boolean;
  fetchCurrency: (force?: boolean) => Promise<void>;
  setBaseCurrency: (code: string) => void;
}

const DEFAULT_CURRENCIES: EnabledCurrency[] = [{ code: "INR", symbol: "₹", name: "Indian Rupee", exchangeRate: 1 }];

/**
 * Single source of truth for the tenant's accounting base currency across
 * every accounting-module screen. Backed by AccountingSettings.currency.
 * Any screen that changes the base currency (currently only
 * Setup > Currency) should call fetchCurrency(true) or setBaseCurrency()
 * so every other mounted accounting screen reflects it immediately,
 * instead of each screen hardcoding "INR"/"₹".
 */
export const useAccountingCurrencyStore = create<AccountingCurrencyStore>((set, get) => ({
  baseCurrency: "INR",
  baseCurrencySymbol: "₹",
  enabledCurrencies: DEFAULT_CURRENCIES,
  hydrated: false,
  loading: false,

  fetchCurrency: async (force = false) => {
    if (get().hydrated && !force) return;
    set({ loading: true });
    try {
      const res = await fetch("/api/finance/accounting/settings");
      const data = await res.json();
      if (data.success) {
        const currency = data.data?.currency;
        const enabledCurrencies: EnabledCurrency[] = currency?.enabledCurrencies?.length ? currency.enabledCurrencies : DEFAULT_CURRENCIES;
        const baseCurrency = currency?.baseCurrency || "INR";
        const baseEntry = enabledCurrencies.find((c) => c.code === baseCurrency);
        set({
          baseCurrency,
          baseCurrencySymbol: baseEntry?.symbol || "₹",
          enabledCurrencies,
          hydrated: true,
        });
      }
    } catch {
      // Keep defaults on failure — non-fatal for the rest of the module.
    } finally {
      set({ loading: false });
    }
  },

  setBaseCurrency: (code: string) => {
    const entry = get().enabledCurrencies.find((c) => c.code === code);
    set({ baseCurrency: code, baseCurrencySymbol: entry?.symbol || get().baseCurrencySymbol });
  },
}));
