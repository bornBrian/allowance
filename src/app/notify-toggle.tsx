"use client";

import { useEffect, useState } from "react";

// Turns on approval requests for this device: registers the service worker,
// subscribes to push with the server's public key, and tells the server where to send.

type Status = "checking" | "unsupported" | "off" | "on" | "blocked";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function NotifyToggle({ pushKey }: { pushKey: string | null }) {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "on" : "off"), () => setStatus("off"));
  }, [pushKey]);

  async function turnOn() {
    if (!pushKey) return;
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't turn on notifications.");
      setStatus("on");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="notify">
      {status === "on" && <p className="small">Requests come to this device as notifications, with Approve and Decline on them.</p>}
      {status === "off" && (
        <>
          <p className="small muted">Get their requests on this phone, and approve them from the notification.</p>
          <button className="light" onClick={turnOn}>
            Turn on notifications
          </button>
        </>
      )}
      {status === "blocked" && (
        <p className="small muted">Notifications are blocked for this site. Allow them in the browser&rsquo;s site settings to get requests here.</p>
      )}
      {status === "unsupported" && (
        <p className="small muted">
          This browser can&rsquo;t receive notifications from Allowance. On iPhone, add it to your Home Screen first (Share,
          then Add to Home Screen), then open it from there.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
