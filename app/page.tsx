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
      <header className="hero">
        <p className="wordmark">Allowance</p>
        <h1>Give your shopping agent an allowance, not your wallet.</h1>
        <p>
          Set your rules in plain words. Ask for what you need. Your agent shops real stores and pays with PayPal only
          when your rules say yes.
        </p>
      </header>

      {error && <p className="error">{error}</p>}
      {state && <Sections state={state} setState={setState} post={post} />}
    </main>
  );
}

type Post = (url: string, body?: unknown) => Promise<void>;

// A first visit is three steps. Once both set-up steps are done, the page leads
// with what's left of the allowance and the request box.
function Sections({ state, setState, post }: { state: AppState; setState: (s: AppState) => void; post: Post }) {
  const setUp = Boolean(state.rulesText) && state.paypal.linked;
  const refresh = () => loadState().then(setState, () => {});

  if (setUp) {
    return (
      <>
        <AllowanceCard state={state} post={post} />
        <Ask state={state} refresh={refresh} post={post} />
        <Spending purchases={state.purchases} post={post} />
      </>
    );
  }
  return (
    <>
      {state.humanCheck.needed && <Welcome siteKey={state.humanCheck.siteKey} setState={setState} />}
      <section className="step">
        <StepTitle n={1} done={Boolean(state.rulesText)}>
          Your rules
        </StepTitle>
        <Rules state={state} post={post} />
      </section>
      <section className="step">
        <StepTitle n={2} done={state.paypal.linked}>
          Link PayPal
        </StepTitle>
        <PayPal state={state} post={post} setState={setState} />
      </section>
      <section className="step">
        <StepTitle n={3} done={false}>
          Ask
        </StepTitle>
        <Ask state={state} refresh={refresh} post={post} bare />
      </section>
      <Spending purchases={state.purchases} post={post} />
    </>
  );
}

function StepTitle({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <h2 className="step-title">
      <span className="step-n">{n}</span>
      {children}
      {done && <span className="small paid"> Done</span>}
    </h2>
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

// What's spent, what's left, the rules and PayPal, at a glance. Rules open for editing in place.
function AllowanceCard({ state, post }: { state: AppState; post: Post }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="card">
      <div className="card-top">
        <div>
          <p className="small muted">Spent this month</p>
          <p className="big-number">{dollars(state.spentThisMonthCents)}</p>
        </div>
        <Budgets state={state} />
      </div>

      <div className="card-row">
        <div className="card-label">Rules</div>
        {editing ? (
          <div style={{ flex: 1 }}>
            <Rules state={state} post={post} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
          </div>
        ) : (
          <>
            <p className="card-text">{state.rulesSummary.join(" ")}</p>
            <button className="link" onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
      </div>

      <div className="card-row">
        <div className="card-label">PayPal</div>
        <p className="card-text">
          Linked
          {state.paypal.email && <span className="small muted email">{state.paypal.email}</span>}
        </p>
        <button className="link" onClick={() => post("/api/paypal/unlink").catch((e) => setError(e.message))}>
          Unlink
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Budgets({ state }: { state: AppState }) {
  if (!state.remaining.length) return null;
  return (
    <ul className="plain budgets">
      {state.remaining.map((r) => {
        const left = Math.max(0, r.budgetCents - r.spentCents);
        const used = r.budgetCents ? Math.min(1, r.spentCents / r.budgetCents) : 0;
        return (
          <li key={r.label}>
            <div className="budget-text">
              <span>{r.label}</span>
              <span className="amount">
                {dollars(left)} <span className="muted">left of {dollars(r.budgetCents)} this {r.period}</span>
              </span>
            </div>
            <div className="bar" aria-hidden>
              <span style={{ width: `${used * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Rules({
  state,
  post,
  onSaved,
  onCancel,
}: {
  state: AppState;
  post: Post;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(state.rulesText ?? EXAMPLE_RULES_TEXT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A saved step folds into its summary until the person chooses to edit it.
  const [open, setOpen] = useState(!state.rulesText || Boolean(onSaved));
  const changed = text.trim() !== (state.rulesText ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await post("/api/rules", { text });
      if (onSaved) onSaved();
      else setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="folded">
        <p className="card-text">{state.rulesSummary.join(" ")}</p>
        <button className="link" onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div>
      {!state.rulesText && <p className="lead">Tell the agent what it may spend, in your own words. Type it or say it.</p>}
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your spending rules" />
      <div className="row">
        <button onClick={save} disabled={busy || !changed}>
          {busy ? "Saving…" : state.rulesText ? "Save changes" : "Save rules"}
        </button>
        <Speak value={text} onChange={setText} disabled={busy} />
        {state.rulesText && (
          <button
            className="link"
            onClick={() => {
              setText(state.rulesText ?? "");
              setOpen(false);
              onCancel?.();
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function PayPal({ state, post, setState }: { state: AppState; post: Post; setState: (s: AppState) => void }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      {state.paypal.linked ? (
        <div className="folded">
          <p className="card-text">
            Linked
            {state.paypal.email && <span className="small muted email">{state.paypal.email}</span>}
          </p>
          <button className="link" onClick={() => post("/api/paypal/unlink").catch((e) => setError(e.message))}>
            Unlink
          </button>
        </div>
      ) : (
        <>
          <p className="lead">
            Link once, in PayPal&rsquo;s own window. Allowance never sees your login, and you can unlink at any time.
          </p>
          {state.paypal.clientId ? (
            <LinkPayPal clientId={state.paypal.clientId} onLinked={setState} onError={setError} />
          ) : (
            <p className="muted">PayPal isn&rsquo;t set up on this server yet.</p>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

const SUGGESTIONS = [
  "A birthday gift for my mum, she loves gardening, under $30",
  "Oat milk and coffee beans for the week",
  "A refill pack of printer paper",
];

function Ask({ state, post, refresh, bare }: { state: AppState; post: Post; refresh: () => void; bare?: boolean }) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [options, setOptions] = useState<Product[]>([]);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(state.rulesText) && state.paypal.linked;
  const purchase = state.purchases.find((p) => p.id === purchaseId) ?? null;
  const finished = !busy && (purchase !== null || reply !== null);

  function clear() {
    setSteps([]);
    setOptions([]);
    setPurchaseId(null);
    setReply(null);
    setError(null);
  }

  async function ask() {
    clear();
    setBusy(true);
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

  const searches = steps.filter((s) => s.startsWith("Searching")).length;

  const body = (
    <>
      {!ready && <p className="lead">Available once your rules are saved and PayPal is linked.</p>}
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
          placeholder="What do you need?"
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

      {ready && !request && !busy && !finished && (
        <div className="suggestions">
          <p className="small muted">Try one of these</p>
          <ul className="plain">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button className="link" onClick={() => setRequest(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {/* While it works, every step shows. When it's done, the steps fold into one line. */}
      {busy && steps.length > 0 && (
        <ul className="plain steps">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
      {busy && options.length > 0 && !purchase && (
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

      {finished && (
        <div className="result">
          {(searches > 0 || options.length > 0) && (
            <p className="small muted" style={{ margin: "0 0 12px" }}>
              Searched {searches === 1 ? "once" : `${searches} times`} · compared {options.length} products
            </p>
          )}
          {purchase ? <Result purchase={purchase} reply={reply} post={post} /> : <p className="reply">{reply}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="link" onClick={clear}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (bare) return body;
  return (
    <section>
      <h2>Ask</h2>
      {body}
    </section>
  );
}

const HEADLINE: Record<Purchase["status"], (p: Purchase) => string> = {
  paying: () => "Paying…",
  paid: (p) => `Paid ${dollars(p.amountCents)} with PayPal`,
  waiting: (p) => `Needs your OK: ${dollars(p.amountCents)}`,
  declined: () => "You declined this",
  blocked: () => "Refused. Nothing was paid",
  refunded: (p) => `Refunded ${dollars(p.amountCents)}`,
  failed: () => "PayPal didn't take the payment",
};

function Result({ purchase, reply, post }: { purchase: Purchase; reply: string | null; post: Post }) {
  return (
    <>
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
    </>
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
  blocked: "Refused",
  refunded: "Refunded",
  failed: "Failed",
};

function Spending({ purchases, post }: { purchases: Purchase[]; post: Post }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (!purchases.length) return null;
  const shown = all ? purchases : purchases.slice(0, 5);
  return (
    <section>
      <h2>Spending</h2>
      <p className="lead">Everything the agent tried to buy, and what your rules decided. Open one to see why.</p>
      <ul className="plain ledger">
        {shown.map((p) => (
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
      {purchases.length > 5 && (
        <button className="link" style={{ marginTop: 12 }} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${purchases.length}`}
        </button>
      )}
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
