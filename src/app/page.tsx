"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentEvent } from "@/lib/agent";
import type { Product } from "@/lib/channel3";
import type { Purchase } from "@/lib/db";
import type { AppState } from "@/lib/state";
import { EXAMPLE_RULES_TEXT } from "@/lib/rules";
import { HumanCheck } from "./human-check";
import { Icon, type IconName } from "./icons";
import { LinkPayPal } from "./link-paypal";
import { Logo } from "./logo";
import { NotifyToggle } from "./notify-toggle";
import { Photo } from "./photo";
import { Speak } from "./speak";
import { Step } from "./steps";

type Post = (url: string, body?: unknown, method?: string) => Promise<void>;
type Tab = "home" | "activity" | "people" | "rules";

// One request to the agent, as it happens: what was asked, each step, the
// products it looked at, and the purchase it proposed.
interface Run {
  request: string;
  busy: boolean;
  steps: string[];
  options: Product[];
  purchaseId: string | null;
  reply: string | null;
  error: string | null;
}

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "activity", label: "Activity", icon: "receipt" },
  { id: "people", label: "People", icon: "people" },
  { id: "rules", label: "Rules", icon: "shield" },
];

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [run, setRun] = useState<Run | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Just linked PayPal: show the last setup step (inviting family) before the home screen.
  const [finishing, setFinishing] = useState(false);

  const refresh = useCallback(() => loadState().then(setState, () => {}), []);

  useEffect(() => {
    loadState()
      .then(setState)
      .catch((e: Error) => setError(e.message));
    // A notification tapped on a phone opens the page at that purchase.
    const id = new URLSearchParams(window.location.search).get("purchase");
    if (id) setOpenId(id);
  }, []);

  // While someone is waiting on someone else, keep the page current without a reload:
  // the payer sees a new request arrive, the person they look after sees the answer.
  const waiting = state?.purchases.some((p) => p.status === "waiting") ?? false;
  const shared = (state?.role === "member" || (state?.members.length ?? 0) > 0) ?? false;
  useEffect(() => {
    if (!shared) return;
    const timer = setInterval(refresh, waiting ? 5000 : 15000);
    return () => clearInterval(timer);
  }, [shared, waiting, refresh]);

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

  async function ask(request: string) {
    setOpenId(null);
    setRun({ request, busy: true, steps: [], options: [], purchaseId: null, reply: null, error: null });
    const update = (change: (r: Run) => Partial<Run>) => setRun((r) => (r ? { ...r, ...change(r) } : r));
    const handle = (e: AgentEvent) => {
      if (e.type === "status") update((r) => ({ steps: [...r.steps, e.text] }));
      else if (e.type === "products")
        update((r) => ({ options: [...r.options, ...e.products.filter((p) => !r.options.some((x) => x.id === p.id))] }));
      else if (e.type === "purchase") {
        update(() => ({ purchaseId: e.purchase.id }));
        refresh();
      } else if (e.type === "reply") update(() => ({ reply: e.text }));
      else if (e.type === "error") update(() => ({ error: e.text }));
    };
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
      update(() => ({ error: (e as Error).message }));
    } finally {
      update(() => ({ busy: false }));
      refresh();
    }
  }

  const close = useCallback(() => {
    setRun((r) => (r?.busy ? r : null));
    setOpenId(null);
  }, []);

  if (!state)
    return <div className="loading">{error ? <p className="error">{error}</p> : <span className="spinner" />}</div>;

  if (state.role === "payer" && (!(state.rulesText && state.paypal.linked) || finishing))
    return (
      <Onboarding
        state={state}
        setState={setState}
        post={post}
        onLinked={() => setFinishing(true)}
        onFinish={() => setFinishing(false)}
      />
    );

  const member = state.role === "member";
  const opened = state.purchases.find((p) => p.id === openId) ?? null;
  const active = Boolean(run || opened);
  const busy = Boolean(run?.busy);
  const goAsk = () => {
    setTab("home");
    setTimeout(() => document.getElementById("ask-input")?.focus(), 50);
  };

  return (
    <div className={member ? "shell solo" : "shell"}>
      {!member && <Sidebar state={state} tab={tab} setTab={setTab} />}
      <main className="main">
        {member ? (
          <MemberHome state={state} ask={ask} busy={busy} open={setOpenId} />
        ) : (
          <>
            {tab === "home" && (
              <PayerHome state={state} post={post} ask={ask} busy={busy} open={setOpenId} setTab={setTab} />
            )}
            {tab === "activity" && <Activity state={state} open={setOpenId} />}
            {tab === "people" && <People state={state} post={post} />}
            {tab === "rules" && <RulesPage state={state} post={post} />}
          </>
        )}
      </main>
      {active && <div className="veil" onClick={close} />}
      {(!member || active) && (
        <AgentPanel state={state} post={post} run={run} purchase={run ? null : opened} close={close} />
      )}
      {!member && (
        <nav className="bottom-nav" aria-label="Sections">
          {TABS.slice(0, 2).map((t) => (
            <TabButton key={t.id} t={t} tab={tab} setTab={setTab} />
          ))}
          <button className="fab" onClick={goAsk} aria-label="Ask the agent">
            <Icon name="plus" />
          </button>
          {TABS.slice(2).map((t) => (
            <TabButton key={t.id} t={t} tab={tab} setTab={setTab} />
          ))}
        </nav>
      )}
    </div>
  );
}

function TabButton({ t, tab, setTab }: { t: (typeof TABS)[number]; tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <button aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
      <Icon name={t.icon} />
      {t.label}
    </button>
  );
}

// ---------- A computer: the menu on the left ----------

function Sidebar({ state, tab, setTab }: { state: AppState; tab: Tab; setTab: (t: Tab) => void }) {
  const name = state.ownerName ?? "You";
  return (
    <aside className="side">
      <Logo />
      <div className="who">
        <span className="avatar" aria-hidden>
          {initial(name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <b>{name}</b>
          <span>Pays with PayPal</span>
        </div>
      </div>
      <div className="side-money">
        <span>Spent this month</span>
        <b>{dollars(state.spentThisMonthCents)}</b>
      </div>
      <nav className="nav" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>
      <p className="side-foot">PayPal sandbox. No real money moves.</p>
    </aside>
  );
}

// ---------- The payer's home ----------

function PayerHome({
  state,
  post,
  ask,
  busy,
  open,
  setTab,
}: {
  state: AppState;
  post: Post;
  ask: (request: string) => void;
  busy: boolean;
  open: (id: string) => void;
  setTab: (t: Tab) => void;
}) {
  const waiting = state.purchases.filter((p) => p.status === "waiting");
  const recent = state.purchases.filter((p) => p.status !== "waiting").slice(0, 5);
  const names = state.members.map((m) => m.name);
  return (
    <>
      <header className="top">
        <span className="avatar mobile-only" aria-hidden>
          {initial(state.ownerName ?? "You")}
        </span>
        <div>
          <p className="hi">{greeting()}</p>
          <h1>{state.ownerName ?? "Welcome back"}</h1>
        </div>
      </header>

      <section className="balance">
        <div>
          <p className="k">Spent this month</p>
          <p className="big">
            <Money cents={state.spentThisMonthCents} />
          </p>
          <p className="k2">{names.length ? `By you and ${names.join(", ")}` : "Paid with PayPal"}</p>
        </div>
        <Pots state={state} />
      </section>

      <AskBox ask={ask} busy={busy} placeholder="Ask the agent for something" suggestions={SUGGESTIONS} />

      {waiting.length > 0 && (
        <>
          <div className="sec-head">
            <h2>Needs your OK</h2>
          </div>
          <div className="ok-row">
            {waiting.map((p) => (
              <OkCard key={p.id} purchase={p} post={post} />
            ))}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <div className="sec-head">
            <h2>Recent activity</h2>
            <button className="text" onClick={() => setTab("activity")}>
              See all
            </button>
          </div>
          <div className="list">
            <Rows purchases={recent} state={state} open={open} />
          </div>
        </>
      )}
    </>
  );
}

const SUGGESTIONS = ["A gardening gift for Mum, under $30", "Oat milk and coffee beans", "Printer paper"];

function AskBox({
  ask,
  busy,
  placeholder,
  suggestions,
}: {
  ask: (request: string) => void;
  busy: boolean;
  placeholder: string;
  suggestions?: string[];
}) {
  const [request, setRequest] = useState("");
  return (
    <form
      className="ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (!request.trim()) return;
        ask(request.trim());
        setRequest("");
      }}
    >
      <div className="ask-row">
        <input
          id="ask-input"
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          aria-label="What should the agent buy?"
        />
        <Speak
          value={request}
          onChange={setRequest}
          disabled={busy}
          className="icon-btn"
          idle={<Icon name="mic" />}
          active={<Icon name="stop" />}
        />
        <button type="submit" disabled={busy || !request.trim()}>
          Ask
        </button>
      </div>
      {suggestions && !request && (
        <div className="chips">
          {suggestions.map((s) => (
            <button type="button" key={s} onClick={() => setRequest(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

// A request waiting for the payer, as a product card.
function OkCard({ purchase: p, post }: { purchase: Purchase; post: Post }) {
  const why = p.checks.find((c) => c.outcome === "ask")?.detail;
  return (
    <article className="ok">
      <div className="photo">
        {p.image && <Photo src={p.image} size={128} />}
      </div>
      <div className="body">
        <p className="who">
          <Icon name="clock" />
          {p.memberName ?? "You"} asked
        </p>
        <p className="name">{p.title}</p>
        <div className="line">
          <span className="meta">{p.shop}</span>
          <span className="price">{dollars(p.amountCents)}</span>
        </div>
        {why && <p className="why">{why}</p>}
        <div className="actions">
          <Actions purchase={p} post={post} role="payer" />
        </div>
      </div>
    </article>
  );
}

function Pots({ state }: { state: AppState }) {
  if (!state.remaining.length) return null;
  return (
    <div className="pots">
      {state.remaining.map((r) => {
        const left = Math.max(0, r.budgetCents - r.spentCents);
        const used = r.budgetCents ? Math.min(1, r.spentCents / r.budgetCents) : 0;
        return (
          <div key={r.label}>
            <div className="pot-head">
              <span>{r.label}</span>
              <span>
                {dollars(left)} left this {r.period}
              </span>
            </div>
            <div className="track" aria-hidden>
              <i style={{ width: `${used > 0 ? Math.max(used * 100, 3) : 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- The other pages ----------

function Activity({ state, open }: { state: AppState; open: (id: string) => void }) {
  const days: { label: string; items: Purchase[] }[] = [];
  for (const p of state.purchases) {
    const label = dayLabel(p.createdAt);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(p);
    else days.push({ label, items: [p] });
  }
  return (
    <>
      <h1 className="page-title">Activity</h1>
      <p className="page-lede">Everything the agent bought or asked about.</p>
      {!days.length && <p className="soft">Nothing yet.</p>}
      {days.map((d) => (
        <div key={d.label}>
          <p className="day">{d.label}</p>
          <div className="list">
            <Rows purchases={d.items} state={state} open={open} />
          </div>
        </div>
      ))}
    </>
  );
}

function People({ state, post }: { state: AppState; post: Post }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h1 className="page-title">People</h1>
      <p className="page-lede">They ask from their own phone. Anything outside your rules comes to you.</p>
      {state.members.length > 0 && (
        <div className="panel">
          {state.members.map((m) => (
            <div className="person" key={m.id}>
              <span className="avatar" aria-hidden>
                {initial(m.name)}
              </span>
              <span className="name">
                {m.name}
                <span>Can ask the agent</span>
              </span>
              <button
                className="text"
                onClick={() => post(`/api/members/${m.id}`, undefined, "DELETE").catch((e) => setError(e.message))}
              >
                Remove
              </button>
            </div>
          ))}
          {error && <p className="error">{error}</p>}
        </div>
      )}
      <div className="panel">
        <h3>Invite someone</h3>
        <p className="small soft" style={{ marginBottom: 12 }}>
          A link for their phone. It works once, for 7 days.
        </p>
        <InviteForm ownerName={state.ownerName} />
      </div>
      <div className="panel">
        <h3>Approvals on this device</h3>
        <NotifyToggle pushKey={state.pushKey} />
      </div>
    </>
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
      <div className="stack">
        <p>
          Send this to <b>{link.name}</b>.
        </p>
        <input type="text" readOnly value={link.url} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <div className="row" style={{ marginTop: 0 }}>
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
            <button className="light" onClick={() => navigator.share({ text: message }).catch(() => {})}>
              Share
            </button>
          )}
          <button className="text" onClick={() => setLink(null)}>
            Invite someone else
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create();
      }}
    >
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name, e.g. Mum" aria-label="Their name" />
      {!ownerName && (
        <input type="text" value={me} onChange={(e) => setMe(e.target.value)} placeholder="Your name, as they know you" aria-label="Your name" />
      )}
      <button type="submit" disabled={busy || !name.trim() || !me.trim()}>
        {busy ? "Creating…" : "Create invite link"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function RulesPage({ state, post }: { state: AppState; post: Post }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h1 className="page-title">Rules</h1>
      <p className="page-lede">Plain code checks every purchase against these before PayPal is called.</p>
      <div className="panel">
        {editing ? (
          <RulesEditor state={state} post={post} onDone={() => setEditing(false)} />
        ) : (
          <>
            <RuleList lines={state.rulesSummary} />
            <button className="light" style={{ marginTop: 16 }} onClick={() => setEditing(true)}>
              Change rules
            </button>
          </>
        )}
      </div>
      <div className="sec-head">
        <h2>PayPal account</h2>
      </div>
      <div className="panel person">
        <span className="pp" aria-hidden>
          P
        </span>
        <span className="name">
          PayPal <em className="paid">Connected</em>
          {state.paypal.email && <span>{state.paypal.email}</span>}
        </span>
        <button className="text" onClick={() => post("/api/paypal/unlink").catch((e) => setError(e.message))}>
          Disconnect
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

function RuleList({ lines }: { lines: string[] }) {
  return (
    <ul className="rule-list">
      {lines.map((l, i) => (
        <li key={i}>
          <Icon name="check" />
          <span>{l}</span>
        </li>
      ))}
    </ul>
  );
}

function RulesEditor({ state, post, onDone }: { state: AppState; post: Post; onDone: () => void }) {
  const [text, setText] = useState(state.rulesText ?? EXAMPLE_RULES_TEXT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = text.trim() !== (state.rulesText ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await post("/api/rules", { text });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your spending rules" />
      <div className="row">
        <button onClick={save} disabled={busy || !changed}>
          {busy ? "Saving…" : "Save rules"}
        </button>
        <Speak value={text} onChange={setText} disabled={busy} className="icon-btn" idle={<Icon name="mic" />} active={<Icon name="stop" />} />
        {state.rulesText && (
          <button className="text" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---------- Someone the payer looks after: what's left, and one big button ----------

function MemberHome({
  state,
  ask,
  busy,
  open,
}: {
  state: AppState;
  ask: (request: string) => void;
  busy: boolean;
  open: (id: string) => void;
}) {
  const [request, setRequest] = useState("");
  const owner = state.ownerName ?? "they";
  const ready = state.rulesSummary.length > 0 && state.paypal.linked;
  const [first, ...others] = state.remaining;
  const send = () => {
    if (!request.trim()) return;
    ask(request.trim());
    setRequest("");
  };

  return (
    <>
      <header className="top">
        <span className="avatar" aria-hidden>
          {initial(state.memberName ?? "?")}
        </span>
        <div>
          <p className="hi">From {state.ownerName ?? "your family"}</p>
          <h1>Hi {state.memberName}</h1>
        </div>
      </header>

      {first && (
        <section className="balance">
          <div>
            <p className="k">
              {first.label} left this {first.period}
            </p>
            <p className="big">
              <Money cents={Math.max(0, first.budgetCents - first.spentCents)} />
            </p>
          </div>
          {others.length > 0 && <Pots state={{ ...state, remaining: others }} />}
        </section>
      )}

      {ready ? (
        <>
          <div className="talk-wrap">
            <Speak value={request} onChange={setRequest} disabled={busy} className="talk" idle={<Icon name="mic" />} active={<Icon name="stop" />} />
          </div>
          <p className="talk-hint">Tap and say what you need</p>
          <p className="talk-sub">If it&rsquo;s outside the allowance, {owner} is asked first.</p>
          <form
            className="ask"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="ask-row">
              <input
                id="ask-input"
                type="text"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder="Or type it here"
                disabled={busy}
                aria-label="What do you need?"
              />
              <button type="submit" disabled={busy || !request.trim()}>
                Ask
              </button>
            </div>
          </form>
        </>
      ) : (
        <p className="talk-sub" style={{ marginTop: 24 }}>
          Ready once {owner} has finished setting up.
        </p>
      )}

      {state.purchases.length > 0 && (
        <>
          <div className="sec-head">
            <h2>Your requests</h2>
          </div>
          <div className="list">
            <Rows purchases={state.purchases.slice(0, 6)} state={state} open={open} />
          </div>
        </>
      )}
    </>
  );
}

// ---------- Lists ----------

function Rows({ purchases, state, open }: { purchases: Purchase[]; state: AppState; open: (id: string) => void }) {
  return (
    <>
      {purchases.map((p) => (
        <button className="row-item" key={p.id} onClick={() => open(p.id)}>
          <Thumb src={p.image} />
          <span>
            <span className="t">{p.title}</span>
            <span className="s">
              {state.role === "payer" ? `${p.memberName ?? "You"} · ` : ""}
              {p.shop} · {timeLabel(p.createdAt)}
            </span>
          </span>
          <span className="amt">
            {dollars(p.amountCents)}
            <span className={`st ${p.status}`}>{statusLabel(p, state)}</span>
          </span>
        </button>
      ))}
    </>
  );
}

function statusLabel(p: Purchase, state: AppState): string {
  if (p.status === "waiting") return state.role === "member" ? `With ${state.ownerName ?? "them"}` : "Needs your OK";
  return { paying: "Paying", paid: "Paid", declined: "Declined", blocked: "Refused", refunded: "Refunded", failed: "Failed" }[
    p.status
  ];
}

// ---------- The agent: a panel beside the page on a computer, a sheet on a phone ----------

function AgentPanel({
  state,
  post,
  run,
  purchase: given,
  close,
}: {
  state: AppState;
  post: Post;
  run: Run | null;
  purchase: Purchase | null;
  close: () => void;
}) {
  const active = Boolean(run || given);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  if (!active) return <aside className="agent">{state.role === "payer" && <Idle state={state} />}</aside>;

  const purchase = given ?? state.purchases.find((p) => p.id === run?.purchaseId) ?? null;
  const busy = run?.busy ?? false;
  const request = run?.request ?? purchase?.request ?? "";
  const asker = purchase?.memberName && state.role === "payer" ? purchase.memberName : null;
  // The chosen product first, then what it was compared with.
  const options = run
    ? [...run.options]
        .sort((a, b) => Number(b.id === purchase?.productId) - Number(a.id === purchase?.productId))
        .slice(0, purchase ? 4 : 6)
    : [];
  const searches = run?.steps.filter((s) => s.startsWith("Searching")).length ?? 0;

  return (
    <aside className="agent active" role="dialog" aria-label="Your agent">
      <div className="grip" />
      <div className="agent-head">
        <h2>Your agent</h2>
        {!busy && (
          <button className="icon-btn ghost" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        )}
      </div>
      {asker && <p className="asker">{asker} asked</p>}
      <p className="bubble">{request}</p>

      {busy && !purchase && (
        <p className="working" aria-live="polite">
          <span className="spinner" />
          {run?.steps[run.steps.length - 1] ?? "Starting"}
        </p>
      )}

      {options.length > 0 && (
        <>
          <p className="found">
            {busy && !purchase
              ? `Found ${run?.options.length} products so far`
              : `Compared ${run?.options.length} products from ${searches === 1 ? "one search" : `${searches} searches`}`}
          </p>
          <div className="grid2">
            {options.map((p, i) => (
              <div className={p.id === purchase?.productId ? "prod chosen" : "prod"} key={p.id} style={{ animationDelay: `${i * 60}ms` }}>
                {p.image ? <Photo src={p.image} size={128} /> : <span className="ph" />}
                {p.id === purchase?.productId && <span className="tag">Chosen</span>}
                <div className="p">{dollars(p.priceCents)}</div>
                <div className="n">{p.shop}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {purchase && <Outcome purchase={purchase} state={state} post={post} />}
      {run && !busy && !purchase && run.reply && <p className="reply-box">{run.reply}</p>}
      {run?.error && <p className="error">{run.error}</p>}
    </aside>
  );
}

// Before anything is asked: what the agent does, and the rules it works within.
function Idle({ state }: { state: AppState }) {
  return (
    <>
      <div className="agent-head">
        <h2>Your agent</h2>
      </div>
      <p className="soft small">Ask for something and watch it work here.</p>
      <ol className="steps-list">
        <Step n={1} title="Finds" text="Compares real products from real shops." />
        <Step n={2} title="Checks" text="Plain code tests every rule. The AI can't skip it." />
        <Step n={3} title="Pays" text="Inside the rules, PayPal pays at once. Otherwise you're asked." />
      </ol>
      <p className="mini">Your rules</p>
      <RuleList lines={state.rulesSummary} />
    </>
  );
}


// The result, like a payment receipt: a big mark, what was bought, and the checks behind it.
function Outcome({ purchase: p, state, post }: { purchase: Purchase; state: AppState; post: Post }) {
  const owner = state.ownerName ?? "them";
  const reason = (outcome: "ask" | "block") => p.checks.find((c) => c.outcome === outcome)?.detail ?? null;
  const view: Record<Purchase["status"], [IconName, string, string | null]> = {
    paying: ["clock", "Paying…", null],
    paid: ["check", `Paid ${dollars(p.amountCents)}`, "with PayPal"],
    waiting: ["clock", state.role === "member" ? `Sent to ${owner}` : "Needs your OK", reason("ask")],
    declined: ["x", "Declined", "Nothing was paid."],
    blocked: ["x", "Refused", reason("block")],
    refunded: ["undo", `Refunded ${dollars(p.amountCents)}`, "Back to PayPal."],
    failed: ["x", "Not paid", "PayPal didn't take the payment."],
  };
  const [icon, title, sub] = view[p.status];

  return (
    <div className={`outcome is-${p.status}`}>
      <div className="head">
        <div className="circle">
          <Icon name={icon} />
        </div>
        <h3>{title}</h3>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <div className="item-line">
        <Thumb src={p.image} />
        <span className="name">
          <a href={p.url} target="_blank" rel="noreferrer">
            {p.title}
          </a>
          <span>{p.shop}</span>
        </span>
      </div>
      {p.why && <p className="because">&ldquo;{p.why}&rdquo;</p>}
      <div className="receipt">
        <div>
          <span>Price</span>
          <span>{dollars(p.amountCents)}</span>
        </div>
        <div>
          <span>Budget</span>
          <span>{p.category}</span>
        </div>
        {p.paypalOrderId && (
          <div>
            <span>PayPal order</span>
            <span>{p.paypalOrderId}</span>
          </div>
        )}
      </div>
      <div className="actions">
        <Actions purchase={p} post={post} role={state.role} />
      </div>
      <Checks purchase={p} />
    </div>
  );
}

// Every rule the purchase was checked against, folded under one line.
function Checks({ purchase }: { purchase: Purchase }) {
  const passed = purchase.checks.filter((c) => c.outcome === "ok").length;
  return (
    <details className="checks">
      <summary>
        {passed} of {purchase.checks.length} checks passed
      </summary>
      <ul>
        {purchase.checks.map((c, i) => (
          <li key={c.label} style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`mark ${c.outcome === "ok" ? "" : c.outcome}`}>
              <Icon name={c.outcome === "ok" ? "check" : c.outcome === "ask" ? "clock" : "x"} />
            </span>
            <span>
              <b>{c.label}.</b> <span className="soft">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
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

  let buttons: React.ReactNode = null;
  if (purchase.status === "waiting" && role === "member")
    buttons = (
      <button className="ghost wide" onClick={() => act("decline")} disabled={busy}>
        Cancel request
      </button>
    );
  else if (purchase.status === "waiting")
    buttons = (
      <div className="pair">
        <button onClick={() => act("approve")} disabled={busy}>
          Approve
        </button>
        <button className="ghost" onClick={() => act("decline")} disabled={busy}>
          Decline
        </button>
      </div>
    );
  else if (purchase.status === "paid" && purchase.paypalCaptureId && role === "payer")
    buttons = (
      <button className="ghost wide" onClick={() => act("refund")} disabled={busy}>
        Refund
      </button>
    );
  if (!buttons) return null;
  return (
    <>
      {buttons}
      {error && <p className="error">{error}</p>}
    </>
  );
}

// ---------- Setting up: what it is on one side, one step at a time on the other ----------

const SETUP_STEPS = ["Rules", "PayPal", "Family"];

function Onboarding({
  state,
  setState,
  post,
  onLinked,
  onFinish,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  post: Post;
  onLinked: () => void;
  onFinish: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const step = state.humanCheck.needed ? 0 : !state.rulesText || editing ? 1 : !state.paypal.linked ? 2 : 3;
  return (
    <div className="onboard">
      <section className="hero-pane">
        <Logo light />
        <h1>Give your family&rsquo;s shopping agent an allowance, not your wallet.</h1>
        <p>An AI agent buys what the people you look after need, with your PayPal, and only inside your rules.</p>
        <ol className="steps-list on-blue">
          <Step n={1} title="You set the rules" text="In plain words, once." />
          <Step n={2} title="They ask, the agent shops" text="By voice or text, from real shops." />
          <Step n={3} title="PayPal pays, or you're asked" text="Anything outside the rules waits for your OK." />
        </ol>
      </section>
      <section className="form-pane">
        <div className="form-card">
          <ol className="stepper" aria-label="Setup">
            {SETUP_STEPS.map((name, i) => {
              const n = i + 1;
              const done = n < step;
              return (
                <li key={name} className={done ? "done" : n === step ? "on" : ""} aria-current={n === step ? "step" : undefined}>
                  {done && n === 1 ? (
                    <button type="button" onClick={() => setEditing(true)} aria-label="Change your rules">
                      <span className="n">
                        <Icon name="check" />
                      </span>
                      {name}
                    </button>
                  ) : (
                    <>
                      <span className="n">{done ? <Icon name="check" /> : n}</span>
                      {name}
                    </>
                  )}
                </li>
              );
            })}
          </ol>

          {step === 0 && <Welcome siteKey={state.humanCheck.siteKey ?? ""} setState={setState} />}

          {step === 1 && (
            <>
              <h2>Set the rules</h2>
              <p className="lede">What may the agent spend? Say it or type it, the way you&rsquo;d tell a person.</p>
              <RulesEditor state={state} post={post} onDone={() => setEditing(false)} />
            </>
          )}

          {step === 2 && (
            <>
              <button type="button" className="back" onClick={() => setEditing(true)}>
                <Icon name="back" />
                Back to rules
              </button>
              <h2>Connect your PayPal</h2>
              <p className="lede">
                The agent pays from this account, and only inside your rules. You log in on PayPal&rsquo;s own page;
                Allowance never sees your password.
              </p>
              <div className="panel connect">
                <div className="person">
                  <span className="pp" aria-hidden>
                    P
                  </span>
                  <span className="name">
                    PayPal
                    <span>Not connected yet</span>
                  </span>
                </div>
                <PayPalLink
                  state={state}
                  onLinked={(s) => {
                    onLinked();
                    setState(s);
                  }}
                />
                <p className="connect-note">PayPal opens in its own window. Nothing is charged now.</p>
              </div>
              {state.paypal.testBuyer && <TestBuyer buyer={state.paypal.testBuyer} />}
              <div className="rules-recap">
                <p className="small soft">Your rules</p>
                <RuleList lines={state.rulesSummary} />
                <button className="text" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>
                  Edit rules
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Who do you look after?</h2>
              <p className="lede">
                Send them a link for their own phone, so they can ask the agent themselves. You can do this later.
              </p>
              <div className="panel person connected">
                <span className="pp" aria-hidden>
                  P
                </span>
                <span className="name">
                  PayPal <em className="paid">Connected</em>
                  {state.paypal.email && <span>{state.paypal.email}</span>}
                </span>
              </div>
              <div className="panel">
                <InviteForm ownerName={state.ownerName} />
              </div>
              <button className="light wide" style={{ marginTop: 14 }} onClick={onFinish}>
                Go to my allowance
              </button>
            </>
          )}

          <p className="fine">PayPal sandbox. No real money moves.</p>
        </div>
      </section>
    </div>
  );
}

// A PayPal sandbox buyer for judges and testers, when the server is set up with one.
function TestBuyer({ buyer }: { buyer: { email: string; password: string } }) {
  return (
    <div className="test-buyer">
      <p className="tb-head">Testing? Log in to PayPal with this sandbox buyer.</p>
      <div className="tb-row">
        <span>Email</span>
        <Copyable text={buyer.email} />
      </div>
      <div className="tb-row">
        <span>Password</span>
        <Copyable text={buyer.password} />
      </div>
    </div>
  );
}

function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        )
      }
    >
      <code>{text}</code>
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

// Shown once per browser when the human check is on, before anything that costs money.
function Welcome({ siteKey, setState }: { siteKey: string; setState: (s: AppState) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h2>First, a quick check</h2>
      <p className="lede">It keeps this demo free for everyone.</p>
      <HumanCheck siteKey={siteKey} onPassed={setState} onError={setError} />
      {error && <p className="error">{error}</p>}
    </>
  );
}

function PayPalLink({ state, onLinked }: { state: AppState; onLinked: (s: AppState) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {state.paypal.clientId ? (
        <LinkPayPal clientId={state.paypal.clientId} onLinked={onLinked} onError={setError} />
      ) : (
        <p className="soft">PayPal isn&rsquo;t set up on this server yet.</p>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}

// ---------- Small things ----------

function Thumb({ src }: { src: string | null }) {
  return src ? <Photo className="thumb" src={src} size={46} /> : <span className="thumb" />;
}

// Dollars large, cents smaller.
function Money({ cents }: { cents: number }) {
  const [whole, part] = (cents / 100).toFixed(2).split(".");
  return (
    <>
      ${Number(whole).toLocaleString("en-US")}
      <small>.{part}</small>
    </>
  );
}

async function loadState(): Promise<AppState> {
  const res = await fetch("/api/state");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't load. Refresh the page to try again.");
  return data as AppState;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function dollars(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
