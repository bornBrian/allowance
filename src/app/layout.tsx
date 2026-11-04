import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

// Fraunces, a warm serif, for money and headlines; the phone's own font for
// everything else, so it feels like an app rather than a website.
// Bundled at build time and served from this site.
const display = Fraunces({ subsets: ["latin"], axes: ["SOFT", "opsz"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Allowance",
  description: "Pocket money for the AI agent that shops for your family.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe4" },
    { media: "(prefers-color-scheme: dark)", color: "#11140f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render on each request, so every page view gets its own CSP nonce (see proxy.ts).
  await connection();
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
