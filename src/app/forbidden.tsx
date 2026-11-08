import type { Metadata } from "next";
import { ForbiddenView } from "@/components/forbidden-view";

export const metadata: Metadata = { title: "Access denied", robots: { index: false } };

export default function Forbidden() {
  return <main id="main"><ForbiddenView standalone /></main>;
}
