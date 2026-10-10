import type { Metadata } from "next";
import { PageHeader } from "@/components/prose";
import { LiveStats } from "@/components/live-stats";

export const metadata: Metadata = {
  title: "Live on Monad",
  description: "Modalis's numbers, read live from Monad: block time, fees, money held, plans and transactions.",
};

export default function StatsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Live"
        title="Modalis, live on Monad."
        lede="Every number on this page is read from the chain as you look at it, or counted from transactions the server checked on-chain first. Nothing is estimated, and each transaction links to the public record."
      />
      <div className="mx-auto max-w-5xl px-5 py-12">
        <LiveStats />
      </div>
    </>
  );
}
