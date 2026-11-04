import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

// Poppins, a clean geometric font, bundled at build time and served from this site.
const ui = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: "Allowance",
  description: "Pocket money for the AI agent that shops for your family.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f6fb",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render on each request, so every page view gets its own CSP nonce (see proxy.ts).
  await connection();
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
