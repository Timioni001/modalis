import type { Metadata } from "next";
import { PageHeader, Prose, Pull } from "@/components/prose";
import { SystemStatus } from "@/components/system-status";

export const metadata: Metadata = {
  title: "How your money is protected",
  description:
    "Who can move your money, who cannot, and what enforces that — plus how to check any of it " +
    "yourself.",
};

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trust"
        title="Who can move your money, and who can't."
        lede="Handing software your goal should not mean handing it your money. This page says exactly where the line is and what holds it."
      />

      <Prose>
        <h2>The short version</h2>
        <p>
          Modalis can recommend. It cannot act outside the limits you approved, and it can never
          take your money out. Those are not policies it checks before acting — they are held
          somewhere Modalis cannot reach, and anything outside them is refused before it happens.
        </p>

        <Pull>
          This holds even when Modalis is wrong. Even when its reasoning is confidently,
          articulately wrong. It still cannot move your money out, change your limits, or act
          outside them.
        </Pull>

        <h2>Three separate gates</h2>
        <p>
          Every action that could affect your money passes all three. Removing any one of them
          would be a bug; the third is the one that would be a different product.
        </p>
        <ol>
          <li>
            <strong>Are you signed in, and is this your plan?</strong> Your identity comes from a
            verified sign-in, never from something the browser claims. There is no way to ask
            Modalis to act on somebody else&rsquo;s plan, because no request carries whose plan it
            is — it is always the signed-in person&rsquo;s.
          </li>
          <li>
            <strong>Do you currently allow adjustments?</strong> You grant that permission and you
            can withdraw it at any time. It is read fresh each time, not remembered.
          </li>
          <li>
            <strong>Do your own limits allow this specific change?</strong> This is checked where
            Modalis has no authority at all. If the answer is no, the entire action is undone as
            if it never happened — not partially applied, not retried quietly.
          </li>
        </ol>

        <h2>What each party can do</h2>
        <p>These are enforced, not promised:</p>
        <ul>
          <li>
            <strong>You</strong> can set and change your plan, add money, take all of it out at any
            time, pause the plan, and withdraw Modalis&rsquo;s permission to adjust it. None of
            this can be blocked by anyone, including us.
          </li>
          <li>
            <strong>Modalis</strong> can propose an adjustment inside your limits. That is the
            entire list. It cannot withdraw, cannot change your limits, and cannot pick where a
            trade happens.
          </li>
          <li>
            <strong>The AI layer</strong> can read your goal and write explanations. It holds no
            key and signs nothing. Its output is checked against your limits before anyone is asked
            to approve it, and rejected if it does not fit.
          </li>
        </ul>

        <h2>Taking your money out</h2>
        <p>
          There is a single action that returns everything you hold to your own account, and only
          you can run it. It keeps working even when your plan is paused — a pause must never trap
          your money. That is the reason giving Modalis a plan is not the same as giving it your
          money.
        </p>

        <h2 id="verify">Check it yourself</h2>
        <p>
          Everything that happens to your money leaves a receipt, and every receipt can be looked
          up independently of Modalis. Your activity shows one for each action. If Modalis ever
          told you something happened that did not, the receipt is how you would know.
        </p>
        <p>
          The same is true of your limits: they are stored publicly and anyone can read them,
          including you, without asking us.
        </p>

        <h2>What could still go wrong</h2>
        <p>Said plainly, because a trust page that only lists strengths is marketing:</p>
        <ul>
          <li>
            <strong>Your investments can lose value.</strong> Nothing here protects against that.
            The limits control how your money is spread, not which way the market goes.
          </li>
          <li>
            <strong>This has not been independently audited.</strong> It is a demonstration built
            for a hackathon. Do not put money you need behind it.
          </li>
          <li>
            <strong>A compromised sign-in provider</strong> could let an attacker make Modalis act
            on a plan. It could not let them take the money: withdrawals and limit changes are
            yours alone and are enforced where a sign-in has no authority.
          </li>
          <li>
            <strong>If you lose access to your account,</strong> we cannot restore it for you.
            Non-custodial means nobody else holds a key — including us.
          </li>
        </ul>

        <h2 id="built-with">What it runs on</h2>
        <p>
          Modalis settles on Monad, trades through Kuru where it is configured, uses an independent
          Chainlink CRE workflow to watch plans, indexes history with Envio, and signs people in
          through Dynamic. None of these are partnerships or endorsements — they are the
          infrastructure this was built on.
        </p>
        <p>
          What is actually configured on this particular deployment is below, read as the page
          loads. Anything unconfigured says so rather than appearing as a logo.
        </p>
      </Prose>

      <div className="mx-auto max-w-3xl px-5 pb-20">
        <SystemStatus />
      </div>
    </>
  );
}
