import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allowance",
  description: "Give your AI shopping agent an allowance, not your wallet.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render on each request, so every page view gets its own CSP nonce (see proxy.ts).
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
