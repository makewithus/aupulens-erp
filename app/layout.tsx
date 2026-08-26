import "./silence-logs-init";
import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SessionProvider } from "next-auth/react";
import ToastRoot from "@/components/providers/ToastRoot";
import TenantInitializer from "@/components/providers/TenantInitializer";
import TenantWrapper from "@/components/providers/TenantWrapper";
import { ConfirmProvider } from "@/providers/confirm-provider";
import ConfirmRoot from "@/components/providers/ConfirmRoot";
import { SessionTimeout } from "@/components/providers/SessionTimeout";
import { auth } from "@/auth";

const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["400", "500", "700", "900"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Seed the client SessionProvider with the server session so useSession() is
  // authoritative on the FIRST render — no "loading" flash of the dashboard
  // before the auth state is known, and no bounce-to-login glitch.
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets the theme class synchronously before first paint/hydration —
            avoids the flash-of-wrong-theme and the ThemeProvider mount-effect
            delay that made theme switches look laggy. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme-storage');var t=s?JSON.parse(s).state.theme:'dark';document.documentElement.classList.add(t==='light'?'light':'dark');}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className={`${roboto.variable} ${robotoMono.variable} font-mono antialiased`}>
        <SessionProvider session={session}>
          <ThemeProvider>
            <ToastRoot>
              <ConfirmRoot>
                <SessionTimeout />
                <TenantInitializer />
                <TenantWrapper>{children}</TenantWrapper>
              </ConfirmRoot>
            </ToastRoot>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
