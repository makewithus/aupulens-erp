import localFont from "next/font/local";

// Bundle fonts with the app so production builds never fetch Google Fonts.
export const roboto = localFont({
  src: "./fonts/Roboto-Variable.ttf",
  variable: "--font-roboto",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

export const robotoMono = localFont({
  src: "./fonts/RobotoMono-Variable.ttf",
  variable: "--font-roboto-mono",
  weight: "100 700",
  style: "normal",
  display: "swap",
});
