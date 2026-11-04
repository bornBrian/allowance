import { peekInvite } from "@/lib/db";
import { JoinButton } from "./join-button";

// What someone sees when they open the invite link they were sent.
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? peekInvite(token) : null;
  const owner = invite?.ownerName ?? "Someone";

  return (
    <div className="onboard">
      <section className="hero-pane">
        <span className="logo light">
          <span className="mark" aria-hidden>
            a
          </span>
          Allowance
        </span>
        <h1>{invite ? `${owner} has given you an allowance, ${invite.name}.` : "This invite has expired."}</h1>
        <p>
          {invite
            ? "Ask for what you need by just saying it. An agent finds it in real shops and pays for it."
            : "It may have been used already. Ask the person who sent it for a new link."}
        </p>
      </section>
      {invite && (
        <section className="form-pane">
          <div className="form-card">
            <h2>How it works</h2>
            <ul className="rule-list" style={{ margin: "16px 0 24px" }}>
              <li>Say what you need, or type it.</li>
              <li>If it&rsquo;s within the allowance, it&rsquo;s paid straight away.</li>
              <li>If not, {owner} is asked first.</li>
            </ul>
            <JoinButton token={token} />
            <p className="fine">
              You won&rsquo;t see {invite.ownerName ? `${invite.ownerName}'s` : "their"} PayPal details, and you
              can&rsquo;t change the rules.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
