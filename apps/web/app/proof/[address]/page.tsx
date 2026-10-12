import type { Metadata } from "next";
import { PageHeader } from "@/components/prose";
import { ProofView } from "@/components/proof-view";

export const metadata: Metadata = {
  title: "Plan proof",
  description: "A Modalis plan's limits and every transaction, read from Monad, with a link to check each one.",
  robots: { index: false },
};

export default async function ProofPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <>
      <PageHeader
        eyebrow="Proof"
        title="This plan, checked against the chain."
        lede="Everything below is read from Monad as you open the page: the limits the owner approved, what the money is in, and every transaction, each with a link to the public record. Nothing here comes from Modalis's own database."
      />
      <div className="mx-auto max-w-3xl px-5 py-12">
        <ProofView address={address} />
      </div>
    </>
  );
}
