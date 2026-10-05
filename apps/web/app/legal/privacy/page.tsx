import type { Metadata } from "next";
import { PageHeader, Prose, Pull } from "@/components/prose";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Modalis stores about you, what it doesn't, and what you can have removed.",
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Privacy policy"
        lede="What Modalis stores, what it never stores, and what happens to all of it if you ask."
        updated="October 2026"
      />
      <Prose>
        <p>
          <strong>Product copy for a demonstration, not reviewed by a lawyer.</strong> A real
          service would need this replaced by a policy written by qualified counsel for the
          jurisdictions it operates in.
        </p>

        <h2>The principle</h2>
        <p>
          Modalis collects what it needs to do its job and nothing else. There is no account
          signup form, no profile to fill in, no marketing database, and no advertising of any
          kind.
        </p>

        <h2>What Modalis stores</h2>
        <ul>
          <li>
            <strong>Your account address.</strong> The public identifier of the account you sign in
            with. This is how your plan is recognised as yours.
          </li>
          <li>
            <strong>Your goal.</strong> What you called it, the amount, the date, and what you said
            you could add. Your plan&rsquo;s limits live publicly; the name and the contribution do
            not, which is why they are stored here.
          </li>
          <li>
            <strong>Your answers.</strong> What you told Modalis during setup, so a plan can be
            explained later and so you can pick up where you left off.
          </li>
          <li>
            <strong>Explanations and suggestions.</strong> Including the ones your limits refused —
            which exist nowhere else, because a refused action leaves no public trace.
          </li>
          <li>
            <strong>An email address,</strong> only if you chose to sign in with one.
          </li>
        </ul>

        <h2>What Modalis never stores</h2>
        <Pull>
          Never the secret that controls your account. Modalis is non-custodial: it cannot sign
          anything for you, which means it has nothing worth stealing from it in that respect.
        </Pull>
        <p>
          It also does not store your name, address, date of birth, government ID, phone number,
          bank details, or payment card information. It never asks for any of them.
        </p>

        <h2>What is public and not ours to control</h2>
        <p>
          Your plan&rsquo;s limits, your holdings and every transaction you make are recorded on a
          public network. Anyone can read them, they are permanent, and neither you nor we can
          delete them. That is a property of the technology and a deliberate one — it is what lets
          you verify what happened without trusting us.
        </p>
        <p>
          Your account address is pseudonymous rather than anonymous. If it can be linked to you
          elsewhere, that link also applies to everything it has ever done.
        </p>

        <h2>Who else sees it</h2>
        <p>
          Modalis uses a small number of services to function: one to sign you in, one to store
          application data, one to read the network, and a language-model provider to interpret
          goals written in plain English and to write explanations. Each receives only what it
          needs to do its part.
        </p>
        <p>
          Your data is never sold, rented, or shared for advertising. There is no advertising.
        </p>

        <h2>How it is protected</h2>
        <p>
          Application data is stored with row-level access rules, so one person&rsquo;s records
          cannot be read by another even if a request asks for them. Every personal read requires a
          verified sign-in and is scoped to that account; no request can name somebody
          else&rsquo;s. Privileged credentials stay on the server and never reach your browser.
        </p>

        <h2>How long it is kept</h2>
        <p>
          For as long as you use Modalis, plus whatever is needed to keep your history coherent.
          Disconnecting your account does not delete your financial records, because your history
          is the thing that makes past actions explainable.
        </p>

        <h2>What you can ask for</h2>
        <ul>
          <li>A copy of what Modalis holds about you.</li>
          <li>Correction of anything wrong.</li>
          <li>Deletion of what it holds — see the limit below.</li>
          <li>An explanation of how any of it was used.</li>
        </ul>
        <p>
          The limit: what is on the public network cannot be deleted by anyone. We can remove what
          we hold; we cannot remove what was published, and nor can you.
        </p>
        <p>
          Make a request through <a href="/contact">the contact page</a>.
        </p>

        <h2>Cookies</h2>
        <p>
          Modalis sets no advertising or analytics cookies and does no cross-site tracking. What it
          keeps in your browser is what the product needs to work: your sign-in session, and your
          answers while you are part-way through setup. The answers are held only until you finish
          or close the tab, and are never sent anywhere until you approve a plan.
        </p>

        <h2>Children</h2>
        <p>Modalis is not for anyone under 18 and is not directed at children.</p>

        <h2>Changes</h2>
        <p>
          Material changes will be reflected in the date at the top of this page.
        </p>
      </Prose>
    </>
  );
}
