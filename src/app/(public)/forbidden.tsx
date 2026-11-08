import type { Metadata } from "next";
import { ForbiddenView } from "@/components/forbidden-view";

export const metadata: Metadata = { title: "Access denied", robots: { index: false } };

export default function PublicForbidden() {
  return <ForbiddenView />;
}
