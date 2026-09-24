import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeInitScript } from "@/lib/theme-init";
import { CSP_NONCE_HEADER } from "@/lib/security/csp-allowlist";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Truth Bounty - Decentralized Claim Verification",
  description: "A decentralized protocol for verifying claims through community consensus and staking",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hdrs = await headers();
  const nonce = hdrs.get(CSP_NONCE_HEADER) ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <ThemeInitScript nonce={nonce} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
    {/* Skip link for keyboard users */}
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 bg-white text-black px-3 py-2 rounded"
    >
      Skip to content
    </a>

    <Providers>
      <main id="main" tabIndex={-1} role="main">
        {children}
      </main>
    </Providers>
  </body>
</html>
  );
}
