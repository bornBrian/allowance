import "server-only";
import webpush from "web-push";
import { listPushSubscriptions, removePushSubscription } from "./db";

// Approval requests reach the payer's phone as notifications with Approve and
// Decline buttons (Web Push). Nothing is sent when the keys aren't configured.

export function vapidPublicKey(): string | null {
  return (process.env.VAPID_PRIVATE_KEY && process.env.VAPID_PUBLIC_KEY) || null;
}

let configured = false;
function setUp(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || process.env.APP_URL || "https://localhost", publicKey, privateKey);
  configured = true;
  return true;
}

// The browser chooses where notifications are delivered, so the server would
// post to whatever address it's given. Only the real push services are allowed,
// so a forged subscription can't make the server call anything else.
const PUSH_SERVICES = [
  /(^|\.)fcm\.googleapis\.com$/, // Chrome, Android
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)notify\.windows\.com$/, // Edge on Windows
  /(^|\.)push\.apple\.com$/, // Safari, iPhone
];

export function allowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && PUSH_SERVICES.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export interface ApprovalNotice {
  purchaseId: string;
  title: string; // "Mum's agent wants $54.99"
  body: string; // product, shop and why it needs approval
}

// Sends to every device the payer turned notifications on for. Never throws:
// a failed notification must not affect the purchase, which waits on the page anyway.
export async function notifyPayer(walletId: string, notice: ApprovalNotice): Promise<void> {
  if (!setUp()) return;
  const payload = JSON.stringify({ ...notice, url: `/?purchase=${notice.purchaseId}` });
  await Promise.all(
    listPushSubscriptions(walletId).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: "high", timeout: 5000 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // Gone or not found: the person turned notifications off on that device.
        if (status === 404 || status === 410) removePushSubscription(sub.endpoint);
        else console.error("Push failed", status ?? err);
      }
    }),
  );
}
