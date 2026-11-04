import { peekInvite } from "@/lib/db";
import { JoinButton } from "./join-button";

// What someone sees when they open the invite link they were sent.
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? peekInvite(token) : null;
  const owner = invite?.ownerName ?? "Someone";

  return (
    <div className="page solo">
      <div className="app">
        <header className="app-top">
          <span className="brand">
            <span className="coin" aria-hidden>
              a
            </span>
            Allowance
          </span>
        </header>
        <div className="screen onboard">
          {invite ? (
            <>
              <h1 className="serif">Hi {invite.name}.</h1>
              <p className="lede">{owner} has given you an allowance for the things you need.</p>
              <div className="wallet">
                <div className="k">How it works</div>
                <div className="pots">
                  <div>Say what you need, or type it.</div>
                  <div>If it&rsquo;s within the allowance, it&rsquo;s paid straight away.</div>
                  <div>If not, {owner} is asked first.</div>
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <JoinButton token={token} />
              </div>
              <p className="small soft" style={{ marginTop: 14 }}>
                You won&rsquo;t see {invite.ownerName ? `${invite.ownerName}'s` : "their"} PayPal details, and you can&rsquo;t
                change the rules.
              </p>
            </>
          ) : (
            <>
              <h1 className="serif">This invite has expired.</h1>
              <p className="lede">It may have been used already. Ask the person who sent it for a new link.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
