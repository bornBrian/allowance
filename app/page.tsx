"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentEvent } from "@/lib/agent";
import type { Product } from "@/lib/channel3";
import type { Purchase } from "@/lib/db";
import type { AppState } from "@/lib/state";
import { EXAMPLE_RULES_TEXT } from "@/lib/rules";
import { HumanCheck } from "./human-check";
import { LinkPayPal } from "./link-paypal";
import { Speak } from "./speak";

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadState()
      .then(setState)
      .catch((e: Error) => setError(e.message));
  }, []);

  const post = useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
    setState(data as AppState);
  }, []);

  return (
    <main>
      <header>
        <h1>Allowance</h1>
        <p>Give your shopping agent an allowance, not your wallet.</p>
      </header>

      {error && <p className="error">{error}</p>}
      {state && <Sections state={state} setState={setState} post={post} />}
    </main>
  );
}

type Post = (url: string, body?: unknown) => Promise<void>;

// Setting up comes first until it's done. After that, asking is the main thing,
// and the rules and PayPal sections move below as settings.
function Sections({ state, setState, post }: { state: AppState; setState: (s: AppState) => void; post: Post }) {
  const setUp = Boolean(state.rulesText) && state.paypal.linked;
  const refresh = () => loadState().then(setState, () => {});
  const settings = (
    <>
      <Rules state={state} post={post} />
      <PayPal state={state} post={post} setState={setState} />
    </>
  );
  return (
    <>
      {state.humanCheck.needed && <Welcome siteKey={state.humanCheck.siteKey} setState={setState} />}
      {!setUp && settings}
      <Ask state={state} refresh={refresh} post={post} />
      <Spending purchases={state.purchases} post={post} />
      {setUp && settings}
    </>
  );
}

// Shown once per browser when the human check is on, before anything that costs money.
function Welcome({ siteKey, setState }: { siteKey: string; setState: (s: AppState) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <section>
      <h2>Before you start</h2>
      <p className="lead">A quick check that you&rsquo;re a person. It keeps this demo free for everyone.</p>
      <HumanCheck siteKey={siteKey} onPassed={setState} onError={setError} />
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Rules({ state, post }: { state: AppState; post: Post }) {
  const [text, setText] = useState(state.rulesText ?? EXAMPLE_RULES_TEXT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = text.trim() !== (state.rulesText ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await post("/api/rules", { text });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Rules</h2>
      <p className="lead">Tell the agent what it may spend, in your own words. Type it or say it.</p>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your spending rules" />
      <div className="row">
        <button onClick={save} disabled={busy || !changed}>
          {busy ? "Saving…" : state.rulesText ? "Update rules" : "Save rules"}
        </button>
        <Speak value={text} onChange={setText} disabled={busy} />
      </div>
      {error && <p className="error">{error}</p>}

      {state.rulesSummary.length > 0 && (
        <div className="box" style={{ marginTop: 16 }}>
          <p className="small muted" style={{ margin: "0 0 6px" }}>
            The agent will follow these rules
          </p>
          <ul className="plain rules">
            {state.rulesSummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {state.remaining.length > 0 && (
            <div className="left">
              {state.remaining.map((r) => (
                <div key={r.label}>
                  <span>{r.label}</span>
                  <span className="amount">
                    {dollars(Math.max(0, r.budgetCents - r.spentCents))} left of {dollars(r.budgetCents)} this{" "}
                    {r.period}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PayPal({
  state,
  post,
  setState,
}: {
  state: AppState;
  post: Post;
  setState: (s: AppState) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <section>
      <h2>PayPal</h2>
      <p className="lead">
        Link PayPal once. The agent can only charge it when your rules allow, and you can unlink it at any time.
      </p>
      {state.paypal.linked ? (
        <div className="row">
          <span>Linked{state.paypal.email ? ` to ${state.paypal.email}` : ""}</span>
          <button className="link" onClick={() => post("/api/paypal/unlink").catch((e) => setError(e.message))}>
            Unlink
          </button>
        </div>
      ) : state.paypal.clientId ? (
        <LinkPayPal clientId={state.paypal.clientId} onLinked={setState} onError={setError} />
      ) : (
        <p className="muted">PayPal isn't set up on this server yet.</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Ask({ state, post, refresh }: { state: AppState; post: Post; refresh: () => void }) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [options, setOptions] = useState<Product[]>([]);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(state.rulesText) && state.paypal.linked;
  const purchase = state.purchases.find((p) => p.id === purchaseId) ?? null;

  async function ask() {
    setBusy(true);
    setSteps([]);
    setOptions([]);
    setPurchaseId(null);
    setReply(null);
    setError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json()).error ?? "Something went wrong.");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line) handle(JSON.parse(line) as AgentEvent);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  function handle(e: AgentEvent) {
    if (e.type === "status") setSteps((s) => [...s, e.text]);
    else if (e.type === "products") setOptions((o) => [...o, ...e.products.filter((p) => !o.some((x) => x.id === p.id))]);
    else if (e.type === "purchase") {
      setPurchaseId(e.purchase.id);
      refresh();
    } else if (e.type === "reply") setReply(e.text);
    else if (e.type === "error") setError(e.text);
  }

  return (
    <section>
      <h2>Ask</h2>
      <p className="lead">
        {ready ? "Say what you need. The agent finds it and pays within your rules." : "Save your rules and link PayPal first."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (request.trim()) ask();
        }}
      >
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="A birthday gift for my mum, she loves gardening"
          disabled={!ready || busy}
          aria-label="What should the agent buy?"
        />
        <div className="row">
          <button type="submit" disabled={!ready || busy || !request.trim()}>
            {busy ? "Working…" : "Ask"}
          </button>
          <Speak value={request} onChange={setRequest} disabled={!ready || busy} />
        </div>
      </form>
      {error && <p className="error">{error}</p>}

      {steps.length > 0 && (
        <ul className="plain steps">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}

      {options.length > 0 && !purchase && (
        <div className="options">
          {options.slice(0, 6).map((p) => (
            <div className="option" key={p.id}>
              <Thumb src={p.image} />
              <span className="title">{p.title}</span>
              <span className="amount muted">
                {dollars(p.priceCents)} · {p.shop}
              </span>
            </div>
          ))}
        </div>
      )}

      {purchase && <Result purchase={purchase} reply={reply} post={post} />}
      {!purchase && reply && !busy && <p className="reply">{reply}</p>}
    </section>
  );
}

const HEADLINE: Record<Purchase["status"], (p: Purchase) => string> = {
  paying: () => "Paying…",
  paid: (p) => `Paid ${dollars(p.amountCents)} with PayPal`,
  waiting: (p) => `Needs your OK: ${dollars(p.amountCents)}`,
  declined: () => "You declined this",
  blocked: () => "Blocked. Nothing was paid",
  refunded: (p) => `Refunded ${dollars(p.amountCents)}`,
  failed: () => "PayPal didn't take the payment",
};

function Result({ purchase, reply, post }: { purchase: Purchase; reply: string | null; post: Post }) {
  return (
    <div className="result">
      <h3 className={purchase.status}>{HEADLINE[purchase.status](purchase)}</h3>
      <div className="product">
        <Thumb src={purchase.image} large />
        <div>
          <a href={purchase.url} target="_blank" rel="noreferrer">
            {purchase.title}
          </a>
          <div className="small muted">
            {purchase.shop} · counts against {purchase.category}
          </div>
        </div>
      </div>
      {reply && <p className="reply">{reply}</p>}
      <Checks purchase={purchase} />
      <Actions purchase={purchase} post={post} />
    </div>
  );
}

function Checks({ purchase }: { purchase: Purchase }) {
  return (
    <ul className="plain checks">
      {purchase.checks.map((c) => (
        <li key={c.label}>
          <span className={c.outcome === "ok" ? "muted" : c.outcome}>{c.label}</span>
          <span>{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function Actions({ purchase, post }: { purchase: Purchase; post: Post }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: string) => {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/purchases/${purchase.id}/${action}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (purchase.status === "waiting") {
    return (
      <>
        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={() => act("approve")} disabled={busy}>
            Approve and pay {dollars(purchase.amountCents)}
          </button>
          <button className="secondary" onClick={() => act("decline")} disabled={busy}>
            Decline
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </>
    );
  }
  if (purchase.status === "paid" && purchase.paypalCaptureId) {
    return (
      <>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="secondary" onClick={() => act("refund")} disabled={busy}>
            Refund
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </>
    );
  }
  return null;
}

const STATUS: Record<Purchase["status"], string> = {
  paying: "Paying",
  paid: "Paid",
  waiting: "Needs your OK",
  declined: "Declined",
  blocked: "Blocked",
  refunded: "Refunded",
  failed: "Failed",
};

function Spending({ purchases, post }: { purchases: Purchase[]; post: Post }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!purchases.length) return null;
  return (
    <section>
      <h2>Spending</h2>
      <p className="lead">Everything the agent tried to buy, and what your rules decided.</p>
      <ul className="plain ledger">
        {purchases.map((p) => (
          <li key={p.id}>
            <button className="entry" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
              <Thumb src={p.image} />
              <span style={{ minWidth: 0 }}>
                <span className="title" style={{ display: "block" }}>
                  {p.title}
                </span>
                <span className="small muted">
                  {p.shop} · {p.category} · {when(p.createdAt)}
                </span>
              </span>
              <span className="amount">
                {dollars(p.amountCents)}
                <span className={`small ${p.status}`} style={{ display: "block" }}>
                  {STATUS[p.status]}
                </span>
              </span>
            </button>
            {open === p.id && (
              <div className="detail">
                <p className="small" style={{ margin: 0 }}>
                  <span className="muted">You asked:</span> {p.request}
                </p>
                {p.why && (
                  <p className="small" style={{ margin: "4px 0 0" }}>
                    <span className="muted">Agent:</span> {p.why}
                  </p>
                )}
                <Checks purchase={p} />
                {p.paypalOrderId && <p className="small muted">PayPal order {p.paypalOrderId}</p>}
                <Actions purchase={p} post={post} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Thumb({ src, large }: { src: string | null; large?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={large ? "thumb large" : "thumb"} src={src} alt="" /> : <span className="thumb" />;
}

async function loadState(): Promise<AppState> {
  const res = await fetch("/api/state");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't load. Refresh the page to try again.");
  return data as AppState;
}

function dollars(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
