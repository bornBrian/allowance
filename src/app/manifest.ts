import type { MetadataRoute } from "next";

// Lets people add Allowance to their home screen. On iPhone, that's what allows
// approval requests to arrive as notifications.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Allowance",
    short_name: "Allowance",
    description: "Give your shopping agent an allowance, not your wallet.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
