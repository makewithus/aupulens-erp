/**
 * Aupulens Brand Identity Digital Colors (Image 1 Specification)
 * // BRAND IDENTITY /// POWERING THE PLANNING SYSTEMS
 * ©2025 Aupulens Brand Guidelines
 */

export const BRAND_COLORS = {
  // A / TEXT
  text: {
    primary: "#F2F2F2", // RGB: 242, 242, 242 | HSL: 0, 0%, 94.9%
    secondary: "#757575", // RGB: 117, 117, 117 | HSL: 0, 0%, 45.9%
    tertiary: "#525252", // RGB: 82, 82, 82 | HSL: 0, 0%, 32.2%
  },

  // B / BACKGROUND
  background: {
    primary: "#0A0A0A", // RGB: 10, 10, 10 | HSL: 0, 0%, 3.9%
    secondary: "#161616", // RGB: 22, 22, 22 | HSL: 0, 0%, 8.6%
  },

  // C / LINES
  lines: {
    primary: "#272727", // RGB: 39, 39, 39 | HSL: 0, 0%, 15.3%
  },

  // D / CODE / ACCENT
  accent: {
    green: "#8AE06C", // RGB: 138, 224, 108 | HSL: 104.5, 65.2%, 65.1%
    yellow: "#F1DF38", // RGB: 241, 223, 56 | HSL: 54.2, 86.0%, 58.2%
    red: "#F56868", // RGB: 245, 104, 104 | HSL: 0, 87.6%, 68.4%
    purple: "#A77DFF", // RGB: 167, 125, 255 | HSL: 259.4, 100%, 74.5%
    blue: "#6CADF5", // RGB: 108, 173, 245 | HSL: 211.5, 87.3%, 69.2%
  },
} as const;

/**
 * Standard array of the 5 Image 1 brand accents for charts, donuts, and multi-series graphs
 */
export const BRAND_ACCENT_PALETTE = [
  BRAND_COLORS.accent.purple, // #A77DFF
  BRAND_COLORS.accent.blue, // #6CADF5
  BRAND_COLORS.accent.green, // #8AE06C
  BRAND_COLORS.accent.yellow, // #F1DF38
  BRAND_COLORS.accent.red, // #F56868
];

/**
 * Standard 10-module enterprise ERP palette using the Image 1 brand colors as anchors
 */
export const ERP_MODULE_PALETTE = [
  "#A77DFF", // Finance & Accounting (Purple)
  "#6CADF5", // Sales & Operations (Blue)
  "#8AE06C", // Inventory & Fulfillment (Green)
  "#F1DF38", // Manufacturing & Production (Yellow)
  "#F56868", // Procurement & Risk (Red)
  "#B595FF", // CRM & Relations (Lavender)
  "#88C2FF", // HR & Talent (Sky Blue)
  "#A6EB8D", // Warehouse & Logistics (Mint Green)
  "#F6E668", // Quality & Compliance (Gold)
  "#757575", // General & Platform (Secondary Grey)
];
