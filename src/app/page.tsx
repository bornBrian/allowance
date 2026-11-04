"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentEvent } from "@/lib/agent";
import type { Product } from "@/lib/channel3";
import type { Purchase } from "@/lib/db";
import type { AppState } from "@/lib/state";
import { EXAMPLE_RULES_TEXT } from "@/lib/rules";
import { HumanCheck } from "./human-check";
import { LinkPayPal } from "./link-paypal";
import { NotifyToggle } from "./notify-toggle";
import { Speak } from "./speak";

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadState()
      .then(setState)
      .catch((e: Error) => setError(e.message));
  }, []);

  // While someone is waiting on someone else, keep the page current without a reload:
  // the payer sees a new request arrive, the person they look after sees the answer.
  const waiting = state?.purchases.some((p) => p.status === "waiting") ?? false;
  const shared = (state?.role === "member" || (state?.members.length ?? 0) > 0) ?? false;
  useEffect(() => {
    if (!shared) return;
    const timer = setInterval(() => loadState().then(setState, () => {}), waiting ? 5000 : 15000);
    return () => clearInterval(timer);
  }, [shared, waiting]);

  const post = useCallback(async (url: string, body?: unknown, method = "POST") => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
    setState(data as AppState);
  }, []);

  const narrow = state?.role === "member";
  const landing = state?.role === "payer" && !(state.rulesText && state.paypal.linked);
  return (
    <>
      <AppBar state={state} navy={landing} />
      <main className={narrow ? "narrow" : landing ? "flush" : undefined}>
        {state && <Sections state={state} setState={setState} post={post} />}
        {error && <p className="error">{error}</p>}
      </main>
    </>
  );
}

type Post = (url: string, body?: unknown, method?: string) => Promise<void>;

function AppBar({ state, navy }: { state: AppState | null; navy: boolean }) {
  return (
    <header className={navy ? "appbar on-navy" : "appbar"}>
      <div className="appbar-inner">
        <p className="wordmark">
          <span className="mark" aria-hidden>
            A
          </span>
          Allowance
        </p>
        {state?.role === "member" && (
          <span className="who">
            <b>{state.memberName}</b> · from {state.ownerName ?? "your family"}
          </span>
        )}
        {state?.role === "payer" && state.ownerName && (
          <span className="who">
            <b>{state.ownerName}</b> · pays
          </span>
        )}
      </div>
    </header>
  );
}

function Sections({ state, setState, post }: { state: AppState; setState: (s: AppState) => void; post: Post }) {
  const refresh = () => loadState().then(setState, () => {});

  // Someone the payer looks after: big, simple, voice first.
  if (state.role === "member") {
    const owner = state.ownerName ?? "The person who set this up";
    return (
      <div className="member">
        <section className="member-hero" style={{ marginTop: 0 }}>
          <h1>Hi {state.memberName}.</h1>
          <p>
            {owner} has given you an allowance. Say what you need. If it fits, it&rsquo;s paid straight away. If not,{" "}
            {state.ownerName ?? "they"} {state.ownerName ? "is" : "are"} asked first.
          </p>
          {state.remaining.length > 0 && (
            <div className="left">
              <p className="label" style={{ margin: 0, color: "var(--navy-muted)", fontSize: 15 }}>
                What&rsquo;s left
              </p>
              <Budgets state={state} />
            </div>
          )}
        </section>
        <Ask state={state} refresh={refresh} post={post} />
        <Spending state={state} post={post} title="Your requests" />
      </div>
    );
  }

  const setUp = Boolean(state.rulesText) && state.paypal.linked;
  if (setUp) {
    const waiting = state.purchases.filter((p) => p.status === "waiting");
    return (
      <>
        <h1 className="greeting">Hello{state.ownerName ? `, ${state.ownerName}` : ""}.</h1>
        <p className="lead" style={{ marginBottom: 0 }}>
          {waiting.length
            ? `${waiting.length === 1 ? "One request is" : `${waiting.length} requests are`} waiting for your OK.`
            : "Everything is within your rules."}
        </p>
        <div className="dash">
          <div className="dash-main">
            <NeedsYourOk state={state} post={post} />
            <Ask state={state} refresh={refresh} post={post} />
            <Spending state={state} post={post} title="Activity" />
          </div>
          <aside className="dash-side">
            <MoneyCard state={state} label="Spent this month" />
            <Settings state={state} post={post} />
            <People state={state} post={post} />
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      <Landing />
      <section id="setup" className="setup">
        <h2>Set up your allowance</h2>
        <p className="lead">Two minutes. You can change everything later.</p>
        {state.humanCheck.needed && <Welcome siteKey={state.humanCheck.siteKey} setState={setState} />}
        <div className="panel">
          <div className="step">
            <StepTitle n={1} done={Boolean(state.rulesText)}>
              Set your rules
            </StepTitle>
            <Rules state={state} post={post} />
          </div>
          <div className="step">
            <StepTitle n={2} done={state.paypal.linked}>
              Link PayPal
            </StepTitle>
            <PayPal state={state} post={post} setState={setState} />
          </div>
          <div className="step">
            <StepTitle n={3} done={false}>
              Try it
            </StepTitle>
            <p className="lead">
              Once both are done, ask for something here, then invite someone you look after from their own phone.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

// A first visit: say what it is, and show it happening on a phone.
function Landing() {
  return (
    <>
      <div className="hero bleed">
        <div className="hero-inner">
          <div>
            <h1>
              Give your shopping agent an <em>allowance</em>, not your wallet.
            </h1>
            <p className="sub">
              The people you look after ask for what they need, in their own words. An AI agent finds it in real shops and
              pays with your PayPal, only within rules you set. Anything else comes to your phone first.
            </p>
            <div className="cta">
              <button className="big" onClick={() => document.getElementById("setup")?.scrollIntoView({ block: "start" })}>
                Set up an allowance
              </button>
              <span className="fine">PayPal sandbox. No real money moves.</span>
            </div>
          </div>
          <div className="stage" aria-hidden>
            <div className="device">
              <div className="screen">
                <div className="island" />
                <div className="status">
                  <span>9:41</span>
                  <span>100%</span>
                </div>
                <div className="mini-bar">
                  <span className="mark">A</span>Allowance
                </div>
                <div className="hi">Hi Mum.</div>
                <div className="mini-card">
                  <div className="l">Groceries left this week</div>
                  <div className="n">$43.53</div>
                  <div className="track">
                    <span />
                  </div>
                </div>
                <div className="mini-ask">A warm scarf, under $25</div>
                <div className="mini-speak">Speak</div>
                <div className="mini-row">
                  <span className="sq" />
                  <span>
                    Winter scarf · $16.47
                    <br />
                    <span className="w">Waiting for Brian</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="push">
              <div className="head">
                <span className="mark">A</span>
                ALLOWANCE
                <span className="when">now</span>
              </div>
              <div className="t">Mum wants $16.47 at landsend.com</div>
              <div className="b">Cashtouch Pattern Winter Scarf. First purchase from this shop.</div>
              <div className="acts">
                <span>Approve</span>
                <span>Decline</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="facts bleed">
        <div className="facts-inner">
          <div className="fact">
            <b>63 million</b>
            <span>Americans care for a family member</span>
            <small>AARP and National Alliance for Caregiving, 2025</small>
          </div>
          <div className="fact">
            <b>18+</b>
            <span>to hold a PayPal account of your own, so teens can&rsquo;t</span>
            <small>PayPal user agreement</small>
          </div>
          <div className="fact">
            <b>0</b>
            <span>payments outside your rules without your OK</span>
            <small>Checked by plain code, not by the AI</small>
          </div>
        </div>
      </div>

      <div className="how">
        <h2>How it works</h2>
        <p className="lead">Three things, once. Then it just works.</p>
        <div className="tiles">
          <div className="tile yellow">
            <h3>Set the rules in your words</h3>
            <p>Type them or say them. The agent can never pay outside them.</p>
            <div className="ui">
              <div className="ui-card">&ldquo;$60 a week on groceries. Gifts up to $40. No subscriptions.&rdquo;</div>
              <div className="ui-card">
                <span className="k">Understood</span>
                <br />
                Groceries: $60 a week · Gifts: up to $40
              </div>
            </div>
          </div>
          <div className="tile white">
            <h3>Invite someone you look after</h3>
            <p>Mum, or your teenager, gets a link. They ask from their own phone.</p>
            <div className="ui">
              <div className="ui-card">
                <span className="k">Mum asked</span>
                <br />
                Bread and milk for the week
              </div>
              <div className="ui-card">
                <span className="ok">Paid $8.40 with PayPal</span>
                <br />
                <span className="k">Within the groceries budget</span>
              </div>
            </div>
          </div>
          <div className="tile navy">
            <h3>Approve from your lock screen</h3>
            <p>Anything outside your rules comes to you first. One tap, and PayPal pays.</p>
            <div className="ui">
              <div className="ui-card">
                <b>Mum wants $16.47</b>
                <br />
                <span className="k">First purchase from landsend.com</span>
                <div className="btns">
                  <span>Approve</span>
                  <span>Decline</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StepTitle({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <h2 className="step-title">
      <span className="step-n">{n}</span>
      {children}
      {done && <span className="done">Done</span>}
    </h2>
  );
}

// Shown once per browser when the human check is on, before anything that costs money.
function Welcome({ siteKey, setState }: { siteKey: string; setState: (s: AppState) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <h2 className="step-title">Before you start</h2>
      <p className="lead">A quick check that you&rsquo;re a person. It keeps this demo free for everyone.</p>
      <HumanCheck siteKey={siteKey} onPassed={setState} onError={setError} />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// Requests from the people the payer looks after (or the payer's own) that need a yes or no.
function NeedsYourOk({ state, post }: { state: AppState; post: Post }) {
  const waiting = state.purchases.filter((p) => p.status === "waiting");
  if (!waiting.length) return null;
  return (
    <section className="needs-ok">
      <h2>Needs your OK</h2>
      <ul className="plain">
        {waiting.map((p) => {
          const why = p.checks.find((c) => c.outcome === "ask")?.detail;
          return (
            <li key={p.id} className="ok-item">
              <div className="product">
                <Thumb src={p.image} />
                <div style={{ minWidth: 0 }}>
                  <div>
                    <b>{p.memberName ?? "You"}</b> asked for {p.title}
                  </div>
                  <div className="small muted">
                    {dollars(p.amountCents)} at {p.shop}
                    {why ? ` · ${why}` : ""}
                  </div>
                </div>
              </div>
              <Actions purchase={p} post={post} role="payer" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The allowance as a card: what's been spent, and what's left of each budget.
function MoneyCard({ state, label }: { state: AppState; label: string }) {
  return (
    <section className="money-card">
      <p className="label">{label}</p>
      <p className="big-number">{dollars(state.spentThisMonthCents)}</p>
      {state.remaining.length === 0 ? <p className="sub">No weekly or monthly budgets set.</p> : <Budgets state={state} />}
    </section>
  );
}

function Budgets({ state }: { state: AppState }) {
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
                {dollars(left)} <span className="muted">left this {r.period}</span>
              </span>
            </div>
            <div className="bar" aria-hidden>
              <span style={{ width: `${used > 0 ? Math.max(used * 100, 3) : 0}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// The payer's rules and PayPal, each one line until opened.
function Settings({ state, post }: { state: AppState; post: Post }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="panel settings">
      <h2>Your allowance</h2>
      <div className="row-item">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-label">Rules</div>
          {editing ? (
            <Rules state={state} post={post} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
          ) : (
            <p className="row-text">{state.rulesSummary.join(" ")}</p>
          )}
        </div>
        {!editing && (
          <button className="link" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      <div className="row-item">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-label">Paid with PayPal</div>
          <p className="row-text">
            {state.paypal.email && (
              <span className="email" title={state.paypal.email}>
                {state.paypal.email}
              </span>
            )}
          </p>
        </div>
        <button className="link" onClick={() => post("/api/paypal/unlink").catch((e) => setError(e.message))}>
          Unlink
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// The people the payer looks after: invite, see who joined, and get their requests on this phone.
function People({ state, post }: { state: AppState; post: Post }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="panel people-panel">
      <h2>People you look after</h2>
      <p className="lead">
        They ask from their own phone. Anything outside your rules comes to you first.
      </p>
      {state.members.length > 0 && (
        <ul className="plain people">
          {state.members.map((m) => (
            <li key={m.id}>
              <span className="avatar" aria-hidden>
                {initial(m.name)}
              </span>
              <span className="name">{m.name}</span>
              <button
                className="link"
                onClick={() => post(`/api/members/${m.id}`, undefined, "DELETE").catch((e) => setError(e.message))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
      <InviteForm ownerName={state.ownerName} />
      <NotifyToggle pushKey={state.pushKey} />
    </section>
  );
}

function InviteForm({ ownerName }: { ownerName: string | null }) {
  const [name, setName] = useState("");
  const [me, setMe] = useState(ownerName ?? "");
  const [link, setLink] = useState<{ url: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ownerName: me }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create the invite.");
      setLink({ url: data.url, name: data.name });
      setName("");
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (link) {
    const message = `${me} has given you a shopping allowance. Open this on your phone to start: ${link.url}`;
    return (
      <div className="invite">
        <p style={{ margin: "0 0 8px" }}>
          Send this to <b>{link.name}</b>. It works once, for 7 days.
        </p>
        <input type="text" readOnly value={link.url} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <div className="row">
          <button
            onClick={() =>
              navigator.clipboard.writeText(link.url).then(
                () => setCopied(true),
                () => setError("Couldn't copy. Select the link and copy it instead."),
              )
            }
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button className="secondary" onClick={() => navigator.share({ text: message }).catch(() => {})}>
              Share
            </button>
          )}
          <button className="link" onClick={() => setLink(null)}>
            Invite someone else
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <form
      className="invite"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create();
      }}
    >
      <div className="fields">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name, e.g. Mum" aria-label="Their name" />
        {!ownerName && (
          <input type="text" value={me} onChange={(e) => setMe(e.target.value)} placeholder="Your name, as they know you" aria-label="Your name" />
        )}
      </div>
      <div className="row">
        <button type="submit" disabled={busy || !name.trim() || !me.trim()}>
          {busy ? "Creating…" : "Create invite link"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
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
        <p className="row-text">{state.rulesSummary.join(" ")}</p>
        <button className="link" onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div>
      {!state.rulesText && <p className="lead">What may the agent spend? Write it the way you&rsquo;d say it, or press Speak.</p>}
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
          <p className="row-text">
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
            <div style={{ maxWidth: 320 }}>
              <LinkPayPal clientId={state.paypal.clientId} onLinked={setState} onError={setError} />
            </div>
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

const MEMBER_SUGGESTIONS = ["Bread and milk for the week", "A warm scarf, under $25", "Batteries for the TV remote"];

function Ask({ state, post, refresh }: { state: AppState; post: Post; refresh: () => void }) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [options, setOptions] = useState<Product[]>([]);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const member = state.role === "member";
  const ready = state.rulesSummary.length > 0 && state.paypal.linked;
  const purchase = state.purchases.find((p) => p.id === purchaseId) ?? null;
  const finished = !busy && (purchase !== null || reply !== null);
  const suggestions = member ? MEMBER_SUGGESTIONS : SUGGESTIONS;

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

  return (
    <section className="ask-box">
      <h2>{member ? "What do you need?" : "Ask for something"}</h2>
      {!ready && (
        <p className="lead">
          {member
            ? `Available once ${state.ownerName ?? "they"} has finished setting up.`
            : "Available once your rules are saved and PayPal is linked."}
        </p>
      )}
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
          placeholder={member ? "Type it, or press Speak" : "What do you need?"}
          disabled={!ready || busy}
          aria-label="What should the agent buy?"
        />
        <div className="row">
          <button type="submit" disabled={!ready || busy || !request.trim()}>
            {busy ? "Working…" : "Ask"}
          </button>
          <Speak
            value={request}
            onChange={setRequest}
            disabled={!ready || busy}
            className={member ? "speak" : "secondary"}
          />
        </div>
      </form>

      {ready && !request && !busy && !finished && (
        <div className="suggestions">
          <p className="small muted">Try one of these</p>
          <ul className="plain">
            {suggestions.map((s) => (
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
          {purchase ? <Result purchase={purchase} reply={reply} post={post} state={state} /> : <p className="reply">{reply}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="link" onClick={clear}>
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function headline(p: Purchase, state: AppState): string {
  const owner = state.ownerName ?? "the payer";
  switch (p.status) {
    case "paying":
      return "Paying…";
    case "paid":
      return `Paid ${dollars(p.amountCents)} with PayPal`;
    case "waiting":
      return state.role === "member" ? `Waiting for ${owner}'s OK: ${dollars(p.amountCents)}` : `Needs your OK: ${dollars(p.amountCents)}`;
    case "declined":
      return state.role === "member" ? "Not approved" : "You declined this";
    case "blocked":
      return "Refused. Nothing was paid";
    case "refunded":
      return `Refunded ${dollars(p.amountCents)}`;
    case "failed":
      return "PayPal didn't take the payment";
  }
}

function Result({ purchase, reply, post, state }: { purchase: Purchase; reply: string | null; post: Post; state: AppState }) {
  return (
    <>
      <h3 className={purchase.status}>{headline(purchase, state)}</h3>
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
      <Actions purchase={purchase} post={post} role={state.role} />
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

function Actions({ purchase, post, role }: { purchase: Purchase; post: Post; role: AppState["role"] }) {
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

  if (purchase.status === "waiting" && role === "member") {
    return (
      <>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="secondary" onClick={() => act("decline")} disabled={busy}>
            Cancel request
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </>
    );
  }
  if (purchase.status === "waiting") {
    return (
      <>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="yellow" onClick={() => act("approve")} disabled={busy}>
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
  if (purchase.status === "paid" && purchase.paypalCaptureId && role === "payer") {
    return (
      <>
        <div className="row" style={{ marginTop: 12 }}>
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

function statusLabel(p: Purchase, state: AppState): string {
  if (p.status === "waiting") return state.role === "member" ? `Waiting for ${state.ownerName ?? "OK"}` : "Needs your OK";
  return { paying: "Paying", paid: "Paid", declined: "Declined", blocked: "Refused", refunded: "Refunded", failed: "Failed" }[
    p.status
  ];
}

// Purchases grouped by day, newest first, like a bank statement.
function Spending({ state, post, title }: { state: AppState; post: Post; title: string }) {
  const { purchases } = state;
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  // A notification tapped on a phone opens the page at that purchase.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("purchase");
    if (id) setOpen(id);
  }, []);

  if (!purchases.length) return null;
  const shown = all ? purchases : purchases.slice(0, 8);
  const days: { label: string; items: Purchase[] }[] = [];
  for (const p of shown) {
    const label = dayLabel(p.createdAt);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(p);
    else days.push({ label, items: [p] });
  }

  return (
    <section className="activity">
      <h2>{title}</h2>
      {days.map((d) => (
        <div key={d.label}>
          <p className="day">{d.label}</p>
          <ul className="plain ledger">
            {d.items.map((p) => (
              <li key={p.id}>
                <button className="entry" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                  <Thumb src={p.image} />
                  <span style={{ minWidth: 0 }}>
                    <span className="title">{p.title}</span>
                    <span className="meta">
                      {state.role === "payer" && (
                        <span className={p.memberName ? "avatar" : "avatar you"} aria-hidden>
                          {initial(p.memberName ?? state.ownerName ?? "You")}
                        </span>
                      )}
                      {state.role === "payer" ? `${p.memberName ?? "You"} · ` : ""}
                      {p.shop}
                    </span>
                  </span>
                  <span className="amount">
                    {dollars(p.amountCents)}
                    <span className={`small ${p.status}`} style={{ display: "block" }}>
                      {statusLabel(p, state)}
                    </span>
                  </span>
                </button>
                {open === p.id && (
                  <div className="detail">
                    <p className="small" style={{ margin: 0 }}>
                      <span className="muted">
                        {p.memberName && state.role === "payer" ? `${p.memberName} asked:` : "You asked:"}
                      </span>{" "}
                      {p.request}
                    </p>
                    {p.why && (
                      <p className="small" style={{ margin: "4px 0 0" }}>
                        <span className="muted">Agent:</span> {p.why}
                      </p>
                    )}
                    <Checks purchase={p} />
                    {p.paypalOrderId && <p className="small muted">PayPal order {p.paypalOrderId}</p>}
                    <Actions purchase={p} post={post} role={state.role} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {purchases.length > 8 && (
        <button className="link" style={{ margin: "12px 0 6px" }} onClick={() => setAll(!all)}>
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

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
