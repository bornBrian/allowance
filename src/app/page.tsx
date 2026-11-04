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

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [run, setRun] = useState<Run | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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

  const close = () => {
    if (run?.busy) return;
    setRun(null);
    setOpenId(null);
  };

  const opened = state?.purchases.find((p) => p.id === openId) ?? null;
  const setUp = state ? state.role === "member" || (Boolean(state.rulesText) && state.paypal.linked) : false;

  return (
    <div className="page">
      <Story />
      <div className="app">
        <TopBar state={state} />
        {state && !setUp && <Onboarding state={state} setState={setState} post={post} />}
        {state?.role === "member" && <MemberHome state={state} ask={ask} busy={Boolean(run?.busy)} open={setOpenId} />}
        {state?.role === "payer" && setUp && (
          <>
            <div className="screen">
              {tab === "home" && <PayerHome state={state} post={post} open={setOpenId} more={() => setTab("activity")} />}
              {tab === "activity" && <Activity state={state} open={setOpenId} />}
              {tab === "people" && <People state={state} post={post} />}
              {tab === "rules" && <RulesTab state={state} post={post} />}
            </div>
            {tab === "home" && <AskBar ask={ask} busy={Boolean(run?.busy)} />}
            <nav className="tabs" aria-label="Sections">
              {(["home", "activity", "people", "rules"] as const).map((t) => (
                <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>
                  {TAB_NAMES[t]}
                </button>
              ))}
            </nav>
          </>
        )}
        {!state && <div className="screen">{error && <p className="error">{error}</p>}</div>}
        {state && run && <Sheet state={state} post={post} close={close} run={run} />}
        {state && !run && opened && <Sheet state={state} post={post} close={close} purchase={opened} />}
      </div>
    </div>
  );
}

const TAB_NAMES: Record<Tab, string> = { home: "Home", activity: "Activity", people: "People", rules: "Rules" };

// Beside the app on a computer: what this is, in four lines. Hidden on phones.
function Story() {
  return (
    <section className="story">
      <h1 className="serif">
        Pocket money for the <i>agent</i> that shops for your family.
      </h1>
      <p>
        Mum says what she needs. An AI agent finds it in real shops and pays with your PayPal, only inside the rules you
        set.
      </p>
      <div className="lines">
        <div className="line">
          <b>1</b>
          <span>Write the rules the way you&rsquo;d say them.</span>
        </div>
        <div className="line">
          <b>2</b>
          <span>Invite Mum, or your teenager, to their own phone.</span>
        </div>
        <div className="line">
          <b>3</b>
          <span>Anything outside the rules waits for your OK, on your lock screen.</span>
        </div>
      </div>
      <p className="note">PayPal sandbox. No real money moves.</p>
    </section>
  );
}

function TopBar({ state }: { state: AppState | null }) {
  const name = state?.role === "member" ? state.memberName : state?.ownerName;
  return (
    <header className="app-top">
      <span className="brand">
        <span className="coin" aria-hidden>
          a
        </span>
        Allowance
      </span>
      {name && (
        <span className="me" title={name} aria-hidden>
          {initial(name)}
        </span>
      )}
    </header>
  );
}

// ---------- Setting up: one question per screen ----------

function Onboarding({ state, setState, post }: { state: AppState; setState: (s: AppState) => void; post: Post }) {
  const [editing, setEditing] = useState(false);
  const step = state.humanCheck.needed ? 0 : !state.rulesText || editing ? 1 : 2;
  return (
    <div className="screen onboard">
      <div className="steps-dots" aria-label={`Step ${Math.max(step, 1)} of 2`}>
        <i className={step >= 1 ? "on" : ""} />
        <i className={step >= 2 ? "on" : ""} />
      </div>
      {step === 0 && <Welcome siteKey={state.humanCheck.siteKey ?? ""} setState={setState} />}
      {step === 1 && (
        <>
          <p className="intro phone-only">Pocket money for the AI agent that shops for your family.</p>
          <h1 className="serif">What may it spend?</h1>
          <p className="lede">Say it or type it, the way you&rsquo;d tell a person.</p>
          <RulesEditor state={state} post={post} onDone={() => setEditing(false)} />
        </>
      )}
      {step === 2 && (
        <>
          <h1 className="serif">Now link PayPal.</h1>
          <p className="lede">Once, in PayPal&rsquo;s own window. Allowance never sees your login.</p>
          <div className="card">
            <RuleLines lines={state.rulesSummary} />
            <button className="text" onClick={() => setEditing(true)}>
              Change rules
            </button>
          </div>
          <div style={{ marginTop: 18 }}>
            <PayPalLink state={state} setState={setState} />
          </div>
        </>
      )}
    </div>
  );
}

// Shown once per browser when the human check is on, before anything that costs money.
function Welcome({ siteKey, setState }: { siteKey: string; setState: (s: AppState) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h1 className="serif">First, a quick check.</h1>
      <p className="lede">It keeps this demo free for everyone.</p>
      <HumanCheck siteKey={siteKey} onPassed={setState} onError={setError} />
      {error && <p className="error">{error}</p>}
    </>
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
        <Speak value={text} onChange={setText} disabled={busy} className="quiet" />
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

function RuleLines({ lines }: { lines: string[] }) {
  return (
    <div>
      {lines.map((l, i) => (
        <div className="rule-line" key={i}>
          <b className="serif">{i + 1}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

function PayPalLink({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {state.paypal.clientId ? (
        <LinkPayPal clientId={state.paypal.clientId} onLinked={setState} onError={setError} />
      ) : (
        <p className="soft">PayPal isn&rsquo;t set up on this server yet.</p>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}

// ---------- The payer ----------

function PayerHome({ state, post, open, more }: { state: AppState; post: Post; open: (id: string) => void; more: () => void }) {
  const waiting = state.purchases.filter((p) => p.status === "waiting");
  const recent = state.purchases.filter((p) => p.status !== "waiting").slice(0, 4);
  return (
    <>
      <h1 className="hello serif">Hello{state.ownerName ? `, ${state.ownerName}` : ""}.</h1>
      <div className="wallet">
        <div className="k">Spent this month</div>
        <div className="big serif">
          <Money cents={state.spentThisMonthCents} />
        </div>
        <Pots state={state} />
      </div>

      {waiting.length > 0 && <h2 className="title">Needs your OK</h2>}
      {waiting.map((p) => (
        <OkCard key={p.id} purchase={p} post={post} />
      ))}

      {recent.length > 0 && (
        <>
          <h2 className="title">Recent</h2>
          <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <Items purchases={recent} state={state} open={open} />
          </div>
          {state.purchases.length > recent.length + waiting.length && (
            <button className="text see" onClick={more}>
              See all
            </button>
          )}
        </>
      )}
    </>
  );
}

function OkCard({ purchase: p, post }: { purchase: Purchase; post: Post }) {
  const why = p.checks.find((c) => c.outcome === "ask")?.detail;
  return (
    <div className="card ok-card">
      <div className="who">{p.memberName ?? "You"} asked</div>
      <div className="what">
        <Pic src={p.image} />
        <span className="name">{p.title}</span>
        <span className="amt serif">{dollars(p.amountCents)}</span>
      </div>
      {why && <div className="why">{why}</div>}
      <Actions purchase={p} post={post} role="payer" />
    </div>
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

function AskBar({ ask, busy }: { ask: (request: string) => void; busy: boolean }) {
  const [request, setRequest] = useState("");
  const send = () => {
    if (!request.trim()) return;
    ask(request.trim());
    setRequest("");
  };
  return (
    <form
      className="askbar"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {!request && (
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button type="button" key={s} onClick={() => setRequest(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="askrow">
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="Ask for something"
          disabled={busy}
          aria-label="What should the agent buy?"
        />
        <Speak value={request} onChange={setRequest} disabled={busy} className="quiet" />
        <button type="submit" disabled={busy || !request.trim()}>
          Ask
        </button>
      </div>
    </form>
  );
}

const SUGGESTIONS = ["A gardening gift for Mum, under $30", "Oat milk and coffee beans", "Printer paper"];

function Activity({ state, open }: { state: AppState; open: (id: string) => void }) {
  if (!state.purchases.length) return <p className="soft" style={{ marginTop: 24 }}>Nothing yet.</p>;
  const days: { label: string; items: Purchase[] }[] = [];
  for (const p of state.purchases) {
    const label = dayLabel(p.createdAt);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(p);
    else days.push({ label, items: [p] });
  }
  return (
    <>
      <h1 className="hello serif">Activity</h1>
      {days.map((d) => (
        <div key={d.label}>
          <p className="day">{d.label}</p>
          <Items purchases={d.items} state={state} open={open} />
        </div>
      ))}
    </>
  );
}

function People({ state, post }: { state: AppState; post: Post }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h1 className="hello serif">People</h1>
      {state.members.length > 0 && (
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {state.members.map((m) => (
            <div className="person" key={m.id}>
              <span className="face" aria-hidden>
                {initial(m.name)}
              </span>
              <span className="name">{m.name}</span>
              <button
                className="text"
                onClick={() => post(`/api/members/${m.id}`, undefined, "DELETE").catch((e) => setError(e.message))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <h2 className="title">Invite someone</h2>
      <div className="card">
        <InviteForm ownerName={state.ownerName} />
      </div>
      <h2 className="title">This phone</h2>
      <div className="card">
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
        <p style={{ margin: 0 }}>
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
            <button className="quiet" onClick={() => navigator.share({ text: message }).catch(() => {})}>
              Share
            </button>
          )}
          <button className="text" onClick={() => setLink(null)}>
            Another
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

function RulesTab({ state, post }: { state: AppState; post: Post }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <h1 className="hello serif">Rules</h1>
      <div className="card">
        {editing ? (
          <RulesEditor state={state} post={post} onDone={() => setEditing(false)} />
        ) : (
          <>
            <RuleLines lines={state.rulesSummary} />
            <button className="text" onClick={() => setEditing(true)}>
              Change
            </button>
          </>
        )}
      </div>
      <h2 className="title">Pays with</h2>
      <div className="card person">
        <span className="pp" aria-hidden>
          P
        </span>
        <span className="name">
          PayPal
          {state.paypal.email && <span className="s">{state.paypal.email}</span>}
        </span>
        <button className="text" onClick={() => post("/api/paypal/unlink").catch((e) => setError(e.message))}>
          Unlink
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="small soft" style={{ margin: "14px 4px 0" }}>
        Plain code checks every purchase against these rules before PayPal is called. The AI can&rsquo;t change them.
      </p>
    </>
  );
}

// ---------- Someone the payer looks after: one number, one big button ----------

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
    <div className="screen">
      <h1 className="hello serif">Hi {state.memberName}.</h1>
      {first && (
        <div className="wallet">
          <div className="k">
            {first.label} left this {first.period}
          </div>
          <div className="big serif">
            <Money cents={Math.max(0, first.budgetCents - first.spentCents)} />
          </div>
          {others.length > 0 && <Pots state={{ ...state, remaining: others }} />}
        </div>
      )}

      {ready ? (
        <>
          <div className="talk-wrap">
            <Speak value={request} onChange={setRequest} disabled={busy} className="talk" />
          </div>
          <p className="talk-hint">Say what you need. {owner} is asked if it&rsquo;s outside the allowance.</p>
          <form
            className="askrow"
            style={{ marginTop: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              type="text"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Or type it here"
              disabled={busy}
              aria-label="What do you need?"
            />
            <button type="submit" className="warm" disabled={busy || !request.trim()}>
              Ask
            </button>
          </form>
        </>
      ) : (
        <p className="talk-hint" style={{ marginTop: 24 }}>
          Ready once {owner} has finished setting up.
        </p>
      )}

      {state.purchases.length > 0 && (
        <>
          <h2 className="title">Your requests</h2>
          <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <Items purchases={state.purchases.slice(0, 6)} state={state} open={open} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Lists ----------

function Items({ purchases, state, open }: { purchases: Purchase[]; state: AppState; open: (id: string) => void }) {
  return (
    <div className="list">
      {purchases.map((p) => (
        <button className="item" key={p.id} onClick={() => open(p.id)}>
          <Pic src={p.image} />
          <span style={{ minWidth: 0 }}>
            <span className="t">{p.title}</span>
            <span className="s">
              {state.role === "payer" ? `${p.memberName ?? "You"} · ` : ""}
              {p.shop}
            </span>
          </span>
          <span className="r">
            <span className="serif">{dollars(p.amountCents)}</span>
            <span className={`st ${p.status}`}>{statusLabel(p, state)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function statusLabel(p: Purchase, state: AppState): string {
  if (p.status === "waiting") return state.role === "member" ? `With ${state.ownerName ?? "them"}` : "Needs your OK";
  return { paying: "Paying", paid: "Paid", declined: "Declined", blocked: "Refused", refunded: "Refunded", failed: "Failed" }[
    p.status
  ];
}

// ---------- The sheet: the agent at work, or one purchase in full ----------

function Sheet({
  state,
  post,
  close,
  run,
  purchase: given,
}: {
  state: AppState;
  post: Post;
  close: () => void;
  run?: Run;
  purchase?: Purchase;
}) {
  const purchase = given ?? state.purchases.find((p) => p.id === run?.purchaseId) ?? null;
  const busy = run?.busy ?? false;
  const request = run?.request ?? purchase?.request ?? "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // The chosen product first, then what it was compared with.
  const options = run
    ? [...run.options].sort((a, b) => Number(b.id === purchase?.productId) - Number(a.id === purchase?.productId)).slice(0, 8)
    : [];
  const searches = run?.steps.filter((s) => s.startsWith("Searching")).length ?? 0;
  const asker = purchase?.memberName && state.role === "payer" ? purchase.memberName : null;

  return (
    <div className="veil" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Request" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        {asker && <p className="asker">{asker} asked</p>}
        <p className="bubble">{request}</p>

        {busy && (
          <p className="status" aria-live="polite">
            <span className="dot" />
            {run?.steps[run.steps.length - 1] ?? "Starting"}
          </p>
        )}
        {run && !busy && options.length > 0 && (
          <p className="status">
            Searched {searches === 1 ? "once" : `${searches} times`}, compared {run.options.length}
          </p>
        )}

        {options.length > 0 && (
          <div className="shelf">
            {options.map((p, i) => (
              <div className={p.id === purchase?.productId ? "prod chosen" : "prod"} key={p.id} style={{ animationDelay: `${i * 60}ms` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image ? <img src={p.image} alt="" /> : <span className="ph" />}
                <div className="p">{dollars(p.priceCents)}</div>
                <div className="n">{p.shop}</div>
              </div>
            ))}
          </div>
        )}

        {purchase && !run && <Verdict purchase={purchase} state={state} post={post} reply={null} />}
        {purchase && <Checks purchase={purchase} />}
        {purchase && run && !busy && <Verdict purchase={purchase} state={state} post={post} reply={run.reply} />}
        {run && !busy && !purchase && run.reply && (
          <div className="verdict declined">
            <p className="reply" style={{ margin: 0 }}>
              {run.reply}
            </p>
          </div>
        )}
        {run?.error && <p className="error">{run.error}</p>}
        {purchase?.paypalOrderId && !run && <p className="small soft">PayPal order {purchase.paypalOrderId}</p>}

        {!busy && (
          <button className="quiet wide" style={{ marginTop: 16 }} onClick={close}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

const MARKS = { ok: "✓", ask: "?", block: "×" } as const;

// Every rule the purchase was checked against, ticked off one by one.
function Checks({ purchase }: { purchase: Purchase }) {
  return (
    <ul className="checks">
      {purchase.checks.map((c, i) => (
        <li key={c.label} style={{ animationDelay: `${i * 90}ms` }}>
          <span className={`mark ${c.outcome === "ok" ? "" : c.outcome}`} aria-label={c.outcome}>
            {MARKS[c.outcome]}
          </span>
          <span>
            <b>{c.label}</b> <span className="soft">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Verdict({ purchase: p, state, post, reply }: { purchase: Purchase; state: AppState; post: Post; reply: string | null }) {
  const owner = state.ownerName ?? "them";
  const word = {
    paying: "Paying…",
    paid: "Paid",
    waiting: state.role === "member" ? `Sent to ${owner}` : "Needs your OK",
    declined: "Declined",
    blocked: "Refused",
    refunded: "Refunded",
    failed: "Not paid",
  }[p.status];
  const reason =
    p.status === "blocked"
      ? p.checks.find((c) => c.outcome === "block")?.detail
      : p.status === "waiting"
        ? p.checks.find((c) => c.outcome === "ask")?.detail
        : p.status === "paid"
          ? `Counted under ${p.category}.`
          : null;
  return (
    <div className={`verdict ${p.status}`}>
      <div className="word serif">{word}</div>
      <div className="row2">
        <Pic src={p.image} />
        <span className="name">
          <a href={p.url} target="_blank" rel="noreferrer">
            {p.title}
          </a>
          <span className="s">{p.shop}</span>
        </span>
        <span className="amt serif">{dollars(p.amountCents)}</span>
      </div>
      {(reason || reply) && <p className="reply">{reason ?? reply}</p>}
      <Actions purchase={p} post={post} role={state.role} />
    </div>
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
      <button className="quiet wide" onClick={() => act("decline")} disabled={busy}>
        Cancel request
      </button>
    );
  else if (purchase.status === "waiting")
    buttons = (
      <div className="pair">
        <button className="warm" onClick={() => act("approve")} disabled={busy}>
          Approve
        </button>
        <button className="quiet" onClick={() => act("decline")} disabled={busy}>
          Decline
        </button>
      </div>
    );
  else if (purchase.status === "paid" && purchase.paypalCaptureId && role === "payer")
    buttons = (
      <button className="quiet" onClick={() => act("refund")} disabled={busy} style={{ marginTop: 12 }}>
        Refund
      </button>
    );
  if (!buttons) return null;
  return (
    <div style={{ marginTop: 12 }}>
      {buttons}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---------- Small things ----------

function Pic({ src }: { src: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="pic" src={src} alt="" /> : <span className="pic" />;
}

// Dollars large, cents small, like a price tag.
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
