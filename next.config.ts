import type { NextConfig } from "next";

// Security headers for every response. The Content Security Policy is set per
// request in proxy.ts, because it carries a fresh nonce.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The microphone is allowed for this site only, for speaking rules and requests.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()" },
  // PayPal's login opens in a popup that reports back to this page, so popups keep their link to it.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Channel3's product photos are full size (often close to 1 MB). The server
  // shrinks each one to the size it's shown at, once, and caches it. Only
  // Channel3's image host is allowed, so this can't fetch anything else.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.trychannel3.com" }],
    imageSizes: [96, 128, 192, 256],
    formats: ["image/webp"],
    minimumCacheTTL: 86400,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
