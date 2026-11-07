import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Root 404 (outside the public layout): renders its own brand header. */
export default function NotFound() {
  return <main id="main"><NotFoundView standalone /></main>;
}
