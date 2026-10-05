import type { Metadata } from "next";
import { PageHeader, Prose } from "@/components/prose";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms under which Modalis is made available.",
};

export default function TermsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Terms of service"
        lede="Plain terms for a demonstration product. Written to be read rather than to be survived."
        updated="October 2026"
      />
      <Prose>
        <p>
          <strong>These terms are product copy for a hackathon demonstration.</strong> They have
          not been drafted or reviewed by a lawyer. Before Modalis were offered as a real service
          to real people, they would need to be replaced by terms written by qualified counsel for
          the jurisdictions it operates in.
        </p>

        <h2>1. What Modalis is</h2>
        <p>
          Modalis is software that helps you organise money around a goal. It creates a plan from
          your answers, keeps your money inside limits you approve, and suggests adjustments when
          it drifts. It is a technical demonstration, not a financial service.
        </p>
        <p>
          Modalis is not an investment adviser, broker, bank, fund or custodian, and nothing it
          produces is advice. See the <a href="/legal/risk">risk disclosure</a>, which forms part
          of these terms.
        </p>

        <h2>2. Using it</h2>
        <p>
          You may use Modalis if you can form a binding contract where you live and are not barred
          from doing so by any applicable law or sanctions regime. You are responsible for whether
          using it is lawful where you are.
        </p>

        <h2>3. Your account</h2>
        <p>
          Modalis is non-custodial. You hold what controls your account; we never do. You are
          responsible for keeping it safe. If you lose it, nobody can recover your money — not us,
          not anyone.
        </p>
        <p>
          Everything done through your account is treated as done by you. Never share what controls
          it with anyone, including anyone claiming to be us.
        </p>

        <h2>4. What we do and do not do for you</h2>
        <p>
          We do not hold your money, select investments on your behalf outside the limits you
          approved, guarantee any outcome, or monitor whether a plan remains suitable for your
          circumstances. Modalis acts within the limits you set and nowhere else.
        </p>
        <p>
          Approving a plan or an adjustment is your decision. We provide information and a
          mechanism; the choice is yours.
        </p>

        <h2>5. Availability</h2>
        <p>
          Modalis is provided as-is and may be unavailable, interrupted, changed or discontinued at
          any time without notice. It depends on infrastructure we do not control. We do not
          promise it will be available when you want it.
        </p>

        <h2>6. No warranty</h2>
        <p>
          To the fullest extent permitted by law, Modalis is provided without warranties of any
          kind, express or implied, including fitness for a particular purpose, merchantability,
          accuracy and non-infringement. We do not warrant that it is free of defects or that any
          figure it shows is correct.
        </p>

        <h2>7. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, the people who build Modalis are not liable for
          any loss arising from your use of it — including investment losses, lost profits, lost
          data, loss of access to your account, or any indirect or consequential loss — whether or
          not we were advised such loss was possible.
        </p>
        <p>
          Some jurisdictions do not allow these exclusions. Where that is so, they apply only as
          far as the law permits, and nothing here excludes liability for fraud or for death or
          personal injury caused by negligence.
        </p>

        <h2>8. Acceptable use</h2>
        <p>
          Use of Modalis is subject to the <a href="/legal/acceptable-use">acceptable use policy</a>.
        </p>

        <h2>9. Changes</h2>
        <p>
          These terms may change. Material changes will be reflected in the date at the top of this
          page. Continuing to use Modalis after a change means you accept it.
        </p>

        <h2>10. Ending it</h2>
        <p>
          You can stop using Modalis at any time and withdraw everything you hold; no permission is
          required and nobody can prevent it. We may stop providing Modalis at any time. Neither
          affects transactions that have already settled, which cannot be reversed.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about these terms go through <a href="/contact">the contact page</a>.
        </p>
      </Prose>
    </>
  );
}
