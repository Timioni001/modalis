"use client";

/**
 * "Jump to" search: every page in the app, filtered as you type.
 *
 * Opens with ⌘K / Ctrl+K from anywhere in the app, or from the search buttons. Arrow keys move,
 * Enter opens. Focus trap, Escape and focus return are Base UI's.
 */
import { Dialog } from "@base-ui/react/dialog";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type ReactElement, type ReactNode } from "react";

export type PaletteItem = {
  href: string;
  label: string;
  group: string;
  icon: (p: { active?: boolean }) => ReactElement;
  /** Extra words people might type for this page. */
  keywords?: string;
};

export function CommandPalette({
  items,
  trigger,
  triggerClassName,
  triggerLabel = "Search pages",
  shortcut = false,
}: {
  items: PaletteItem[];
  trigger: ReactNode;
  triggerClassName: string;
  triggerLabel?: string;
  /** Only one palette on the page should listen for ⌘K. */
  shortcut?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.label} ${item.group} ${item.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setIndex(0);
        }
      }}
    >
      <Dialog.Trigger aria-label={triggerLabel} className={triggerClassName}>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="nav-backdrop fixed inset-0 z-[70] bg-black/35 backdrop-blur-sm" />
        <Dialog.Popup className="nav-sheet fixed inset-x-4 top-[max(12vh,16px)] z-[71] mx-auto max-w-lg overflow-hidden rounded-[24px] bg-surface text-ink shadow-[var(--shadow-float)]">
          <Dialog.Title className="sr-only">Jump to a page</Dialog.Title>
          <Dialog.Description className="sr-only">
            Type to filter, use the arrow keys to choose and Enter to open.
          </Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <SearchIcon />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setIndex((i) => Math.min(i + 1, results.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setIndex((i) => Math.max(i - 1, 0));
                } else if (event.key === "Enter" && results[index]) {
                  event.preventDefault();
                  go(results[index].href);
                }
              }}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={results[index] ? `${listId}-${index}` : undefined}
              aria-label="Search pages"
              placeholder="Jump to…"
              className="min-h-[56px] flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-muted palette-input"
            />
            <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
              Esc
            </kbd>
          </div>
          <ul id={listId} role="listbox" aria-label="Pages" className="max-h-[min(60dvh,420px)] overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-ink-muted">
                No page matches “{query}”.
              </li>
            ) : (
              results.map((item, i) => {
                const Icon = item.icon;
                const showGroup = i === 0 || results[i - 1].group !== item.group;
                return (
                  <li key={item.href} role="presentation">
                    {showGroup ? (
                      <div role="presentation" className="eyebrow px-3 pt-3 pb-1.5 text-ink-muted">
                        {item.group}
                      </div>
                    ) : null}
                    <div
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === index}
                      onMouseMove={() => setIndex(i)}
                      onClick={() => go(item.href)}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium ${
                        i === index ? "bg-sunken text-ink" : "text-ink-soft"
                      }`}
                    >
                      <Icon active={i === index} />
                      <span className="flex-1">{item.label}</span>
                      {pathname === item.href ? (
                        <span className="text-xs text-ink-muted">You are here</span>
                      ) : i === index ? (
                        <span aria-hidden className="text-xs text-ink-muted">↵</span>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m13.2 13.2 3.3 3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
