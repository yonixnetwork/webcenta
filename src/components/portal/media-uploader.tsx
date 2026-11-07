"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";

type Upload = (form: FormData) => Promise<{ ok: true; id: string; url: string } | { ok: false; message: string }>;

/** Uploads images through a server action and keeps their ids in hidden inputs of the surrounding form. */
export function MediaUploader({ name, kind, upload, initial, multiple = false, max = 8, label }: {
  name: string; kind: "LOGO" | "SCREENSHOT"; upload: Upload; initial: Array<{ id: string; url: string }>; multiple?: boolean; max?: number; label: string;
}) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-3">
        {items.map((it) => (
          <div key={it.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded preview */}
            <img src={it.url} alt="" className={kind === "LOGO" ? "size-20 rounded-2xl border border-border object-cover" : "h-24 w-auto rounded-xl border border-border object-cover"} />
            <input type="hidden" name={name} value={it.id} />
            <button type="button" aria-label="Remove image" onClick={() => setItems((x) => x.filter((i) => i.id !== it.id))}
              className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-danger text-white"><X className="size-3.5" aria-hidden /></button>
          </div>
        ))}
        {(multiple ? items.length < max : items.length === 0) && (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClass("secondary", "md", "h-20")}>
            <ImagePlus className="size-5" aria-hidden /> {busy ? "Uploading…" : "Upload"}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" aria-label={label} data-testid={`upload-${name}`}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true); setError("");
          const f = new FormData();
          f.set("file", file);
          f.set("kind", kind);
          const r = await upload(f);
          setBusy(false);
          if (r.ok) setItems((x) => (multiple ? [...x, { id: r.id, url: r.url }] : [{ id: r.id, url: r.url }]));
          else setError(r.message);
        }} />
      <p className="text-xs text-subtle">{kind === "LOGO" ? "Square PNG/JPEG/WebP, at least 64×64, max 2 MB." : "PNG/JPEG/WebP, at least 200px, max 6 MB each, up to 8."} Images are re-encoded and reviewed before publication.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
