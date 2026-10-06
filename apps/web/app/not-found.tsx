import Link from "next/link";
import { ModalisMark } from "@/components/brand";

/**
 * A 404 that helps rather than apologises.
 *
 * Someone who lands here was going somewhere. The useful thing is the way back to the two places
 * they were probably headed, not an oversized "404" and a sad face.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5 py-20">
      <span className="text-ink-muted">
        <ModalisMark size={36} />
      </span>
      <h1 className="display mt-7 text-3xl font-semibold text-ink sm:text-4xl">
        That page doesn&rsquo;t exist.
      </h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        The link may be out of date, or the address may have a typo in it. Nothing is wrong with
        your plan or your money.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/app"
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink"
        >
          Go to my money
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-line px-6 text-sm font-semibold text-ink hover:bg-sunken"
        >
          Back to the start
        </Link>
      </div>
    </div>
  );
}
