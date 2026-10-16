"use client";

import { Dialog } from "@base-ui/react/dialog";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/** One modal at a time: focus trap, Escape, outside dismissal and focus return are Base UI's. */
export function NavigationSheet({
  title,
  trigger,
  bottom = false,
  triggerClassName,
  children,
}: {
  title: string;
  trigger: ReactNode;
  bottom?: boolean;
  /** Replaces the default trigger styling, e.g. for a tab inside a tab bar. */
  triggerClassName?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={
          triggerClassName ??
          (bottom
            ? "inline-flex min-h-12 max-w-full items-center gap-3 rounded-full bg-panel px-5 text-sm font-semibold text-panel-ink shadow-[var(--shadow-float)] transition-transform active:scale-[0.98]"
            : "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-sunken px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-line")
        }
      >
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="nav-backdrop fixed inset-0 z-[70] bg-black/35 backdrop-blur-sm" />
        <Dialog.Popup
          className={`nav-sheet fixed inset-x-4 z-[71] mx-auto max-h-[min(80dvh,640px)] max-w-md overflow-y-auto overscroll-contain rounded-[28px] bg-surface p-5 text-ink shadow-[var(--shadow-float)] ${bottom ? "bottom-[max(16px,env(safe-area-inset-bottom))]" : "top-[max(16px,env(safe-area-inset-top))]"}`}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <Dialog.Title className="text-xl font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={`Close ${title.toLowerCase()}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sunken text-xl"
            >
              ×
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Choose a page. Test network demonstration only.
          </Dialog.Description>
          {/* Also closes when the selected link already matches the current route. */}
          <div
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a[href]"))
                setOpen(false);
            }}
          >
            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
