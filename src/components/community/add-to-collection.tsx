"use client";

import { FolderPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { addToCollectionAction, createCollectionAction } from "@/server/actions/user";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";

export function AddToCollection({ slug, collections }: { slug: string; collections: Array<{ id: string; title: string }> }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} className={buttonClass("secondary", "md")} onClick={() => setOpen((o) => !o)}>
        <FolderPlus className="size-4" aria-hidden /> Add to collection
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-2xl border border-border bg-surface p-3 shadow-pop">
          {collections.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-auto">
              {collections.map((c) => (
                <li key={c.id}>
                  <button type="button" disabled={pending} className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    onClick={() => start(async () => setMsg((await addToCollectionAction(c.id, slug)).message))}>{c.title}</button>
                </li>
              ))}
            </ul>
          )}
          <form className="flex gap-2" action={async (f) => {
            f.set("addSlug", slug);
            const r = await createCollectionAction({ ok: false, message: "" }, f);
            setMsg(r.ok ? "Created and added." : r.message);
          }}>
            <label className="sr-only" htmlFor="new-col">New collection name</label>
            <input id="new-col" name="title" required maxLength={80} placeholder="New collection" className={inputClass} />
            <button type="submit" className={buttonClass("primary", "sm")}>Create</button>
          </form>
          {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
        </div>
      )}
    </div>
  );
}
