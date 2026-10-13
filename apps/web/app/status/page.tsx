import type { Metadata } from "next";
import { SystemStatus } from "@/components/system-status";
import { PageHeader } from "@/components/prose";

export const metadata: Metadata = {
  title: "Deployment status",
  description: "Live technical checks for this Modalis deployment.",
  robots: { index: false, follow: false },
};

/** Unlinked operational view; public product pages should stay focused on the product. */
export default function StatusPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operational view"
        title="Deployment status"
        lede="Live checks for the network, saved data and optional integrations. This page is intentionally not part of the product navigation."
      />
      <div className="mx-auto max-w-3xl px-5 pb-20">
        <SystemStatus />
      </div>
    </>
  );
}
