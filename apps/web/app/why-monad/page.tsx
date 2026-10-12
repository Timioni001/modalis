import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Prose, Pull } from "@/components/prose";

export const metadata: Metadata = {
  title: "Why Monad",
  description:
    "What Monad's speed, parallel execution and low fees let Modalis do that would be impractical elsewhere.",
};

export default function WhyMonadPage() {
  return (
    <>
      <PageHeader
        eyebrow="Why Monad"
        title="A plan that manages itself needs a chain that keeps up."
        lede="Modalis keeps your money on the plan you approved, inside limits a contract enforces. Here's what Monad specifically makes possible, explained by what you see in the app."
      />

      <Prose>
        <h2>Confirmed while you&rsquo;re still looking</h2>
        <p>
          Monad makes a block about every 0.4 seconds and finalizes it almost immediately. So when
          you add money, approve your plan or take money out, Modalis waits for the real block
          before saying &ldquo;done&rdquo;, and tells you how long it took. It&rsquo;s usually
          well under two seconds. There&rsquo;s no &ldquo;pending&rdquo; state to explain.
        </p>

        <h2>Your plan, re-checked every block</h2>
        <p>
          The live drift meter on your overview re-reads your holdings from the chain on every new
          block. On a slower chain that would mean refreshing every 12 seconds or more; here
          it&rsquo;s twice a second, so what you see is where your money is now.
        </p>

        <h2>Many plans corrected at once</h2>
        <p>
          When the market moves, it moves everyone&rsquo;s plan at the same moment. Monad runs
          transactions in parallel, and each person&rsquo;s plan, balances and adjustment counter
          live in storage of their own, so the adjustments for different people don&rsquo;t queue
          behind each other. They land in the same block.{" "}
          <a href="https://github.com/Timioni001/modalis/blob/claude/awesome-gates-h1pxk0/docs/parallel-execution.md">
            How the contracts are laid out for this
          </a>
          , including the places where state is still shared.
        </p>

        <h2>Small balances are worth managing</h2>
        <p>
          A transaction on Monad costs a tiny fraction of a cent. That changes who automatic
          management is for: keeping a $200 emergency fund on plan is worth doing when each
          adjustment costs almost nothing, and so is adding a little every day instead of a lump
          once a month.
        </p>

        <Pull>
          Fast blocks make the rules feel instant. Parallel execution lets them apply to everyone
          at once. Low fees make them worth applying to small savings.
        </Pull>

        <h2>The rules live where Modalis can&rsquo;t change them</h2>
        <p>
          None of the speed would matter if it only made mistakes faster. Every adjustment goes
          through your own plan&rsquo;s contract on Monad, which refuses anything outside the
          limits you approved, and only you can take money out. See{" "}
          <Link href="/security">how your money is protected</Link>, or watch it happen on the{" "}
          <Link href="/stats">live numbers page</Link>.
        </p>
      </Prose>
    </>
  );
}
