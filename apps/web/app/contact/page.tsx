import type { Metadata } from "next";
import { PageHeader, Prose } from "@/components/prose";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the people who build Modalis, and what to expect when you do.",
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Getting in touch"
        lede="Modalis is a small project built for a hackathon. There is no support desk, and saying so is more useful than pretending otherwise."
      />
      <Prose>
        <h2>Something is broken</h2>
        <p>
          Open an issue on the repository. Include what you were doing, what you expected, and what
          happened instead. If it involves a transaction, the receipt reference is the single most
          useful thing you can include.
        </p>

        <h2>Something looks like a security problem</h2>
        <p>
          Please report it privately rather than opening a public issue, and give us a reasonable
          window to fix it before describing it publicly. Include enough detail to reproduce it.
          There is no bounty programme — this is an unfunded demonstration — but credit is given
          wherever a reporter wants it.
        </p>

        <h2>You want your data removed</h2>
        <p>
          Anything Modalis stores about you can be deleted on request. What it cannot delete is the
          public record of transactions you signed, which is not ours to remove.{" "}
          <a href="/legal/privacy">The privacy policy</a> sets out what is stored and what
          isn&rsquo;t.
        </p>

        <h2>What not to send</h2>
        <p>
          Never send anyone the secret that controls your account — not us, not someone claiming to
          be us. Nobody from Modalis will ever ask for it. There is no situation in which handing
          it over helps you.
        </p>
      </Prose>
    </>
  );
}
