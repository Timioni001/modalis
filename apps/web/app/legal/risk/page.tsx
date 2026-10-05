import type { Metadata } from "next";
import { PageHeader, Prose, Pull } from "@/components/prose";

export const metadata: Metadata = {
  title: "Risk disclosure",
  description: "What can go wrong when you use Modalis, said plainly.",
};

export default function RiskPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Risk disclosure"
        lede="The honest list of what can go wrong. Read this before putting anything into Modalis."
        updated="October 2026"
      />
      <Prose>
        <Pull>
          Modalis is a technical demonstration built for a hackathon. It has not been audited, it
          is not a regulated financial service, and you should not put money you need behind it.
        </Pull>

        <h2>You can lose money</h2>
        <p>
          Investments go down as well as up. Modalis controls how your money is spread and the
          limits it stays within; it has no control over what the market does. A plan that is
          followed perfectly can still end up worth less than you put in.
        </p>
        <p>
          Nothing in this product is a prediction. Every forward-looking figure Modalis shows
          assumes your money neither grows nor falls, and is a statement about contributions you
          make — not about returns.
        </p>

        <h2>This is not a regulated financial service</h2>
        <p>
          Modalis is not an investment adviser, broker, dealer, bank, fund, or pooled investment
          vehicle. It holds no licence or registration in any jurisdiction. Nothing it produces is
          financial, investment, tax or legal advice, and no fiduciary relationship exists between
          you and the people who built it.
        </p>
        <p>
          Protections you might expect from a regulated provider — deposit insurance, compensation
          schemes, a complaints ombudsman, suitability obligations — do not apply here. None of
          them.
        </p>

        <h2>The software has not been audited</h2>
        <p>
          The programs that hold the limits and move the money have been tested by the people who
          wrote them and by nobody else. No independent security audit has been carried out. Bugs
          in this kind of software can result in the permanent, irreversible loss of everything
          involved.
        </p>

        <h2>Nobody can recover your account</h2>
        <p>
          Modalis is non-custodial: you hold what controls your account and nobody else does,
          including us. If you lose access to it, your money cannot be recovered by anyone. There
          is no password reset, no support override and no backup copy held on your behalf.
        </p>

        <h2>Transactions are final</h2>
        <p>
          Once an action is settled it cannot be reversed, cancelled or charged back. There is no
          dispute process. If you approve something by mistake, it has happened.
        </p>

        <h2>Technology can fail or be unavailable</h2>
        <p>
          Modalis depends on infrastructure it does not control: the network it settles on, the
          venue where trades happen, the service that signs you in, the sources that price your
          investments. Any of these can be slow, unavailable or wrong. During such a period you
          may be unable to add money, adjust your plan or withdraw.
        </p>
        <p>
          Prices used to value your money come from external sources. If a price is stale or
          incorrect, decisions made from it will be incorrect too.
        </p>

        <h2>The AI can be wrong</h2>
        <p>
          Modalis uses a language model to read goals written in plain English and to explain what
          it is doing. It can misread you, and it can produce an explanation that sounds right and
          is not. Its suggestions are checked against your limits before anything happens, which
          bounds the damage — it does not make the suggestions correct.
        </p>
        <p>Read what it tells you. Do not treat it as advice.</p>

        <h2>The demo investments are not real assets</h2>
        <p>
          On test deployments, the investments shown — and names like Bitcoin, Ethereum, Bonds and
          Cash — refer to test tokens with no value whatsoever. They exist to demonstrate the
          mechanism. They are not the assets they are named after, cannot be exchanged for them,
          and are not worth anything.
        </p>

        <h2>Tax is your responsibility</h2>
        <p>
          Modalis does not calculate, withhold or report tax, and does not produce tax documents.
          What you owe and to whom is yours to work out.
        </p>

        <h2>Rules differ where you live</h2>
        <p>
          This may not be lawful to use in your jurisdiction. Determining that is your
          responsibility, not ours.
        </p>
      </Prose>
    </>
  );
}
