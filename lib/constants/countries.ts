/**
 * Country -> {timezone, currency, tax jurisdiction} reference table. Single
 * source of truth so any form collecting a country (onboarding signup, org
 * settings, etc.) can auto-fill timezone/currency/tax jurisdiction instead of
 * asking for them independently.
 *
 * `taxJurisdictionLabel` is a default, admin-overridable label (source doc
 * §5, Phase 9 Addendum C Part 1) — not a real tax-calculation jurisdiction
 * code. A real multi-state/multi-region tenant (e.g. a US company with
 * nexus in several states) may need something more specific than one
 * country-level default, which is exactly why it stays editable per
 * organisation rather than derived and locked, the same reasoning already
 * applied to currency/timezone.
 */
export interface CountryInfo {
  name: string;
  timezone: string;
  timezoneLabel: string;
  currencyCode: string;
  currencyLabel: string;
  taxJurisdictionLabel: string;
}

export const COUNTRIES: CountryInfo[] = [
  { name: "India", timezone: "Asia/Kolkata", timezoneLabel: "IST (GMT+5:30)", currencyCode: "INR", currencyLabel: "INR - Indian Rupee", taxJurisdictionLabel: "India - GST" },
  { name: "United States", timezone: "America/New_York", timezoneLabel: "ET (GMT-5:00)", currencyCode: "USD", currencyLabel: "USD - US Dollar", taxJurisdictionLabel: "United States - Federal + State Sales Tax" },
  { name: "United Kingdom", timezone: "Europe/London", timezoneLabel: "GMT (GMT+0:00)", currencyCode: "GBP", currencyLabel: "GBP - British Pound", taxJurisdictionLabel: "United Kingdom - VAT" },
  { name: "Singapore", timezone: "Asia/Singapore", timezoneLabel: "SGT (GMT+8:00)", currencyCode: "SGD", currencyLabel: "SGD - Singapore Dollar", taxJurisdictionLabel: "Singapore - GST" },
  { name: "United Arab Emirates", timezone: "Asia/Dubai", timezoneLabel: "GST (GMT+4:00)", currencyCode: "AED", currencyLabel: "AED - UAE Dirham", taxJurisdictionLabel: "United Arab Emirates - VAT" },
];

export const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

const BY_NAME = new Map(COUNTRIES.map((c) => [c.name, c]));

export function getCountryInfo(countryName: string): CountryInfo {
  return BY_NAME.get(countryName) || COUNTRIES[0];
}
