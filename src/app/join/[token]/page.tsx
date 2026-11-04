import { peekInvite } from "@/lib/db";
import { Icon } from "../../icons";
import { Logo } from "../../logo";
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
            <ol className="flow" style={{ margin: "18px 0 26px" }}>
              <li>
                <span className="circle">
                  <Icon name="mic" />
                </span>
                <div>
                  <b>Say what you need</b>
                  <span>Or type it. The agent finds it in real shops.</span>
                </div>
              </li>
              <li>
                <span className="circle">
                  <Icon name="check" />
                </span>
                <div>
                  <b>Inside the allowance, it&rsquo;s paid</b>
                  <span>Straight away, with {owner}&rsquo;s PayPal.</span>
                </div>
              </li>
              <li>
                <span className="circle">
                  <Icon name="clock" />
                </span>
                <div>
                  <b>Otherwise {owner} is asked</b>
                  <span>You&rsquo;ll see the answer here.</span>
                </div>
              </li>
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
