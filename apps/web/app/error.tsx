"use client";

/**
 * The last-resort error screen.
 *
 * In a money product the first thing someone needs to know is not what broke — it is whether
 * their money is affected. So that is the first sentence, and it is true: this boundary catches
 * rendering failures, and nothing that moves money happens during a render.
 *
 * The technical detail is kept available but folded away, and it is the framework's own digest
 * rather than a stack trace, which would leak internals to a page anyone can reach.
 */
import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side this is already recorded; logging here catches the browser-only failures.
    console.error("[modalis] render failed:", error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5 py-20">
      <h1 className="display text-3xl font-semibold text-ink sm:text-4xl">
        Something went wrong on this page.
      </h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        <strong className="font-semibold text-ink">Your money hasn&rsquo;t been affected.</strong>{" "}
        This is a problem displaying the page, not a problem with your plan. Nothing was changed.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-accent-ink"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-line px-6 text-sm font-semibold text-ink hover:bg-sunken"
        >
          Go to my money
        </Link>
      </div>
      {error.digest ? (
        <details className="mt-10">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted">
            Reference for support
          </summary>
          <p className="mt-2 font-mono text-xs text-ink-muted">{error.digest}</p>
        </details>
      ) : null}
    </div>
  );
}
