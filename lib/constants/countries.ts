/**
 * Country -> {timezone, currency} reference table. Single source of truth so
 * any form collecting a country (onboarding signup, org settings, etc.) can
 * auto-fill timezone/currency instead of asking for them independently.
 */
export interface CountryInfo {
  name: string;
  timezone: string;
  timezoneLabel: string;
  currencyCode: string;
  currencyLabel: string;
}

export const COUNTRIES: CountryInfo[] = [
  { name: "India", timezone: "Asia/Kolkata", timezoneLabel: "IST (GMT+5:30)", currencyCode: "INR", currencyLabel: "INR - Indian Rupee" },
  { name: "United States", timezone: "America/New_York", timezoneLabel: "ET (GMT-5:00)", currencyCode: "USD", currencyLabel: "USD - US Dollar" },
  { name: "United Kingdom", timezone: "Europe/London", timezoneLabel: "GMT (GMT+0:00)", currencyCode: "GBP", currencyLabel: "GBP - British Pound" },
  { name: "Singapore", timezone: "Asia/Singapore", timezoneLabel: "SGT (GMT+8:00)", currencyCode: "SGD", currencyLabel: "SGD - Singapore Dollar" },
  { name: "United Arab Emirates", timezone: "Asia/Dubai", timezoneLabel: "GST (GMT+4:00)", currencyCode: "AED", currencyLabel: "AED - UAE Dirham" },
];

export const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

const BY_NAME = new Map(COUNTRIES.map((c) => [c.name, c]));

export function getCountryInfo(countryName: string): CountryInfo {
  return BY_NAME.get(countryName) || COUNTRIES[0];
}
