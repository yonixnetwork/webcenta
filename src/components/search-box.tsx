"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "./ui/cn";

interface Suggestions {
  apps: Array<{ slug: string; name: string; publisherName: string }>;
  categories: Array<{ slug: string; name: string }>;
}
type Option = { key: string; label: string; hint?: string; href: string };

/** Search with autocomplete (WAI-ARIA combobox). Works without JS as a plain GET form. */
export function SearchBox({ defaultValue = "", suggested = [], size = "md", autoFocus = false }: {
  defaultValue?: string; suggested?: string[]; size?: "md" | "lg"; autoFocus?: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [data, setData] = useState<Suggestions>({ apps: [], categories: [] });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) return; // empty query shows suggested searches instead
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) setData(await res.json());
      } catch {
        /* aborted or offline: keep previous suggestions */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const term = q.trim();
  const options: Option[] = term
    ? [
        ...data.apps.map((a) => ({ key: `a:${a.slug}`, label: a.name, hint: a.publisherName, href: `/app/${a.slug}` })),
        ...data.categories.map((c) => ({ key: `c:${c.slug}`, label: c.name, hint: "Category", href: `/c/${c.slug}` })),
        { key: "search", label: `Search for “${term}”`, href: `/search?q=${encodeURIComponent(term)}` },
      ]
    : suggested.map((s) => ({ key: `s:${s}`, label: s, hint: "Suggested", href: `/search?q=${encodeURIComponent(s)}` }));

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <form action="/search" method="get" role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && options[active]) return go(options[active]!.href);
          if (term) go(`/search?q=${encodeURIComponent(term)}`);
        }}>
        <label htmlFor={`${listId}-input`} className="sr-only">Search web apps</label>
        <Search className={cn("pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-subtle", size === "lg" ? "size-5" : "size-4")} aria-hidden />
        <input
          id={`${listId}-input`}
          name="q"
          type="search"
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="Search apps, tools and websites"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(options.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(-1, i - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
          }}
          className={cn(
            "w-full rounded-2xl border border-border bg-surface pl-11 pr-10 text-text shadow-card outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand/15 [&::-webkit-search-cancel-button]:hidden",
            size === "lg" ? "h-14 text-base" : "h-11 text-sm",
          )}
        />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setActive(-1); }}
            className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-text">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </form>
      {open && options.length > 0 && (
        <ul id={`${listId}-list`} role="listbox" aria-label="Search suggestions"
          className="absolute z-50 mt-2 max-h-96 w-full overflow-auto rounded-2xl border border-border bg-surface p-1.5 shadow-pop">
          {options.map((o, i) => (
            <li key={o.key} id={`${listId}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); go(o.href); }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm", i === active && "bg-surface-2")}>
              <span className="truncate font-medium">{o.label}</span>
              {o.hint && <span className="shrink-0 truncate text-xs text-subtle">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
