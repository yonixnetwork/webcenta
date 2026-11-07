"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "@/server/actions/user";
import { buttonClass } from "@/components/ui/button";

export function FavoriteButton({ slug, initial, signedIn }: { slug: string; initial: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button type="button" aria-pressed={saved} disabled={pending} className={buttonClass("secondary", "md")}
      onClick={() => {
        if (!signedIn) return router.push(`/signin?next=${encodeURIComponent(`/app/${slug}`)}`);
        start(async () => {
          const r = await toggleFavoriteAction(slug);
          if ("saved" in r) setSaved(r.saved);
          else if (r.error === "signin") router.push(`/signin?next=${encodeURIComponent(`/app/${slug}`)}`);
        });
      }}>
      <Heart className={saved ? "size-4 fill-current text-rose-500" : "size-4"} aria-hidden />
      {saved ? "Saved" : "Save"}
    </button>
  );
}
