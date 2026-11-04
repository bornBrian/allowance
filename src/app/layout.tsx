import type { Metadata, Viewport } from "next";
import { Lexend, Source_Sans_3 } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

// Lexend was designed to make reading easier, which matters for the older people
// Allowance is built for. Source Sans 3 is a calm, very legible text face.
// Both are bundled at build time and served from this site.
const display = Lexend({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const text = Source_Sans_3({ subsets: ["latin"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
  title: "Allowance",
  description: "Give your AI shopping agent an allowance, not your wallet.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render on each request, so every page view gets its own CSP nonce (see proxy.ts).
  await connection();
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
