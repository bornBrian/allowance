import { peekInvite } from "@/lib/db";
import { JoinButton } from "./join-button";

// What someone sees when they open the invite link they were sent.
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? peekInvite(token) : null;

  return (
    <main>
      <header className="hero">
        <p className="wordmark">Allowance</p>
        {invite ? (
          <>
            <h1>
              {invite.ownerName ?? "Someone"} has given you an allowance, {invite.name}.
            </h1>
            <p>
              Ask for what you need, by typing or just saying it. If it&rsquo;s within the allowance, it&rsquo;s paid
              straight away. If not, {invite.ownerName ?? "they"} {invite.ownerName ? "gets" : "get"} asked first.
            </p>
          </>
        ) : (
          <>
            <h1>This invite has expired or was already used.</h1>
            <p>Ask the person who sent it for a new link.</p>
          </>
        )}
      </header>
      {invite && (
        <section>
          <JoinButton token={token} />
          <p className="small muted" style={{ marginTop: 16 }}>
            Joining keeps this phone signed in to the allowance. You won&rsquo;t see their PayPal details, and you
            can&rsquo;t change the rules.
          </p>
        </section>
      )}
    </main>
  );
}
