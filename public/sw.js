// Allowance service worker: shows approval requests and answers them from the
// notification itself, so the payer can approve from the lock screen.

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Allowance", {
      body: data.body || "",
      tag: data.purchaseId,
      data,
      requireInteraction: true,
      actions: [
        { action: "approve", title: "Approve" },
        { action: "decline", title: "Decline" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const { purchaseId, url } = event.notification.data || {};
  event.notification.close();

  if (purchaseId && (event.action === "approve" || event.action === "decline")) {
    event.waitUntil(answer(purchaseId, event.action));
    return;
  }
  event.waitUntil(open(url || "/"));
});

async function answer(purchaseId, action) {
  let title = "Not done";
  let body = "Couldn't do that from here. Open Allowance to try again.";
  try {
    const res = await fetch(`/api/purchases/${encodeURIComponent(purchaseId)}/${action}`, {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      body = data.error || body;
    } else if (action === "decline") {
      title = "Declined";
      body = "Nothing was paid.";
    } else {
      const p = (data.purchases || []).find((x) => x.id === purchaseId);
      const amount = p ? `$${(p.amountCents / 100).toFixed(2)}` : "";
      if (p && p.status === "paid") {
        title = "Paid";
        body = `${amount} with PayPal. ${p.title}`;
      } else if (p && p.status === "blocked") {
        title = "Not paid";
        body = (p.checks[p.checks.length - 1] || {}).detail || "The price changed. Nothing was paid.";
      } else {
        title = "Done";
        body = "Open Allowance to see the details.";
      }
    }
  } catch {
    // Offline or the server was unreachable: the request is still waiting in the app.
  }
  await self.registration.showNotification(title, { body, tag: `${purchaseId}-done` });
}

async function open(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const w of windows) {
    if ("focus" in w) {
      await w.navigate(url).catch(() => {});
      return w.focus();
    }
  }
  return self.clients.openWindow(url);
}
