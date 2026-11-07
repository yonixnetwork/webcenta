import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** 404 inside the public layout (header, footer and navigation stay available). */
export default function PublicNotFound() {
  return <NotFoundView />;
}
