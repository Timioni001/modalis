import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Prose, Pull } from "@/components/prose";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Goal to plan to money, what Modalis does when your plan drifts, and the four limits that " +
    "bound everything it can do.",
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="A plan, and four limits it can't act outside."
        lede="Modalis does one thing: it takes a goal you describe and keeps your money organised around it. Here is exactly how, with none of the machinery hidden behind a word you'd have to look up."
      />

      <Prose>
        <h2 id="goal">It starts with the goal</h2>
        <p>
          You answer a few questions. How much you need, when you need it, how much you can add
          regularly, and what you would actually do if your money fell for a while. That last one
          matters more than it looks: &ldquo;sell everything&rdquo; and &ldquo;add more while
          it&rsquo;s cheap&rdquo; describe very different people, even when both say they could
          tolerate a 15% drop.
        </p>
        <p>
          Nothing is financial jargon and nothing is committed. You can change any of it before you
          approve anything.
        </p>

        <h2 id="plan">Then Modalis writes the plan</h2>
        <p>
          A plan is two things: how your money is spread across a handful of investments, and the
          limits Modalis has to stay inside while it manages them.
        </p>
        <p>
          The spread comes from a deterministic planner — the same answers always produce the same
          plan — which refuses to produce one your own limits would reject. You are never asked to
          approve something that could not work.
        </p>

        <h2 id="limits">The four limits</h2>
        <p>
          These are the whole of Modalis&rsquo;s authority. Everything it may do, it may do only
          inside them.
        </p>
        <ul>
          <li>
            <strong>How much you&rsquo;re comfortable losing.</strong> The largest drop your plan
            is built to tolerate before it gets more cautious.
          </li>
          <li>
            <strong>Money kept available.</strong> The share that stays easy to withdraw, so a plan
            never traps the money you might need.
          </li>
          <li>
            <strong>Maximum in one investment.</strong> No single investment may grow past this
            share of your money, however well it is doing.
          </li>
          <li>
            <strong>When Modalis steps in.</strong> How far off target something can drift before
            Modalis suggests a change.
          </li>
        </ul>
        <p>
          You approve these once, and you can change them whenever you like. Changing them replaces
          the plan: anything Modalis had already worked out against the old limits stops being
          valid, so nothing out of date can go through.
        </p>

        <h2 id="money">Adding money</h2>
        <p>
          Modalis works out the split from your plan&rsquo;s own targets, converts it at live
          prices, and checks you actually hold enough — before you sign anything. If you
          don&rsquo;t, it says so then, rather than letting a transaction fail.
        </p>
        <p>
          Then you approve each step yourself. No Modalis key can put money in, which is exactly
          why no Modalis key can take it out.
        </p>

        <h2 id="adjustments">When your plan drifts</h2>
        <p>
          Investments move. One grows faster than the rest and quietly becomes a bigger share of
          your money than you agreed to. Left alone, your plan stops being the plan you approved.
        </p>
        <p>Modalis watches for that, and when it happens:</p>
        <ol>
          <li>It notices which limit has been crossed.</li>
          <li>It works out the smallest change that brings you back inside it.</li>
          <li>
            It checks that change against your limits <strong>before showing it to you</strong>, so
            you are never asked to approve something your own rules would refuse.
          </li>
          <li>It explains what it wants to do and why, in one sentence.</li>
          <li>You approve it, or you don&rsquo;t.</li>
          <li>If you do, it happens — and you get a receipt you can check yourself.</li>
        </ol>

        <Pull>
          A refusal isn&rsquo;t an error. It&rsquo;s the limits you set doing the job you set them
          for, and Modalis shows it to you rather than retrying quietly.
        </Pull>

        <h2 id="progress">Whether you&rsquo;re on track</h2>
        <p>
          Modalis tells you one of three things: on track, needs attention, or off track. When
          you&rsquo;re short, it says by how much and what would close it — &ldquo;about $140 more
          a month&rdquo; rather than a chart you have to interpret.
        </p>
        <p>
          Every forward-looking number assumes your money neither grows nor falls. That is
          deliberate. Modalis cannot predict the market, and a product that quietly compounds 7% a
          year has turned a guess into a promise that you only find out about at the end. The one
          figure it will put in front of you is money you add yourself. If your plan grows, you
          arrive sooner.
        </p>

        <h2>What it costs</h2>
        <p>
          Nothing — this is a technical demonstration, not a commercial service. There are no fees
          because there is no product to charge for yet.
        </p>

        <p className="!mt-12">
          <Link href="/security">
            Next: how your money is protected, and what stops Modalis acting outside the plan.
          </Link>
        </p>
      </Prose>
    </>
  );
}
