import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SessionProvider } from "next-auth/react";
import ToastRoot from "@/components/providers/ToastRoot";
import TenantInitializer from "@/components/providers/TenantInitializer";
import TenantWrapper from "@/components/providers/TenantWrapper";

const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aupulens ERP - Enterprise Resource Planning",
  description: "Professional ERP system for managing business operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${roboto.variable} ${robotoMono.variable} font-mono antialiased`}>
        <SessionProvider>
          <ThemeProvider>
            <ToastRoot>
              <TenantInitializer />
              <TenantWrapper>{children}</TenantWrapper>
            </ToastRoot>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
