"use client";

import { useBarePathname } from "@/i18n/client";
import { SearchBox } from "./search-box";

/** Header search, hidden on the homepage where the hero search is the primary entry point. */
export function HeaderSearch({ suggested, className }: { suggested: string[]; className: string }) {
  if (useBarePathname() === "/") return null;
  return <div className={className}><SearchBox suggested={suggested} /></div>;
}
