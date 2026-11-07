"use client";

import { usePathname } from "next/navigation";
import { SearchBox } from "./search-box";

/** Header search, hidden on the homepage where the hero search is the primary entry point. */
export function HeaderSearch({ suggested, className }: { suggested: string[]; className: string }) {
  if (usePathname() === "/") return null;
  return <div className={className}><SearchBox suggested={suggested} /></div>;
}
