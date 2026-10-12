"use client";

/**
 * The moment a goal is reached: said plainly, with a shareable card that links to the on-chain
 * proof page rather than to any private detail. Shown only when saved >= target.
 */
import { useState } from "react";
import { Button, Card } from "./ui";
import { usePortfolio } from "./portfolio-provider";
import { moneyLabel } from "@/lib/format";

export function GoalReached() {
  const { progress, goal, address } = usePortfolio();
  const [shared, setShared] = useState(false);
  if (!progress || progress.percentComplete < 100) return null;

  const name = goal?.goal.name ?? "my goal";
  const text = `I reached ${name}: ${moneyLabel(progress.target, 0)}, saved with Modalis on Monad.`;
  const url = address ? `${window.location.origin}/proof/${address}` : window.location.origin;

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Goal reached", text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
    } catch {
      /* the person closed the share sheet */
    }
  }

  return (
    <Card className="overflow-hidden bg-accent text-accent-ink">
      <div className="text-[13px] font-semibold uppercase tracking-[0.09em] opacity-80">Goal reached</div>
      <p className="display mt-3 text-[28px] font-semibold leading-tight sm:text-[34px]">
        You saved {moneyLabel(progress.target, 0)} for {name}.
      </p>
      <p className="mt-2 text-sm opacity-90">
        Your plan kept to the limits you set the whole way. You can take the money out whenever you&rsquo;re ready, or
        set your next goal.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="dark" onClick={share}>
          {shared ? "Shared" : "Share it"}
        </Button>
        <Button variant="secondary" href="/app/withdraw">
          Take it out
        </Button>
        <Button variant="quiet" href="/app/goals">
          Set a new goal
        </Button>
      </div>
    </Card>
  );
}
