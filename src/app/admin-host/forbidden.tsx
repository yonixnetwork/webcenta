import type { Metadata } from "next";
import { ForbiddenView } from "@/components/forbidden-view";

export const metadata: Metadata = { title: "Access denied" };

/** Admin 403 (real 403 status via forbidden()); no public search or categories here. */
export default function AdminForbidden() {
  return <main id="main"><ForbiddenView standalone admin /></main>;
}
