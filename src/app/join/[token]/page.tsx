import { peekInvite } from "@/lib/db";
import { Logo } from "../../logo";
import { Step } from "../../steps";
import { JoinButton } from "./join-button";

// What someone sees when they open the invite link they were sent.
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? peekInvite(token) : null;
  const owner = invite?.ownerName ?? "Someone";

  return (
    <div className="onboard">
      <section className="hero-pane">
        <Logo light />
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
            <ol className="steps-list" style={{ margin: "18px 0 26px" }}>
              <Step n={1} title="Say what you need" text="Or type it. The agent finds it in real shops." />
              <Step n={2} title="Inside the allowance, it's paid" text={`Straight away, with ${owner}'s PayPal.`} />
              <Step n={3} title={`Otherwise ${owner} is asked`} text="You'll see the answer here." />
            </ol>
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
