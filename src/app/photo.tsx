"use client";

import Image from "next/image";
import { useState } from "react";

// A product photo, shrunk by this server to the size it's shown at.
// Photos from anywhere else, or any the server couldn't shrink, are shown as they are.
const OPTIMISED_HOST = "cdn.trychannel3.com";

export function Photo({ src, size, className }: { src: string; size: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try {
    host = new URL(src).hostname;
  } catch {}
  if (host === OPTIMISED_HOST && !failed)
    return (
      <Image src={src} alt="" width={size} height={size} sizes={`${size}px`} className={className} onError={() => setFailed(true)} />
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} />;
}
