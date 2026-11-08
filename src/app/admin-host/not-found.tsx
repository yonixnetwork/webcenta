import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { ErrorPage } from "@/components/error-page";

export const metadata: Metadata = { title: "Page not found" };

export default function AdminNotFound() {
  return (
    <main id="main">
      <ErrorPage code="404" title="Page not found" icon={<SearchX className="size-8" aria-hidden />} standalone showSearch={false} showCategories={false} homeLabel="Back to the dashboard">
        <p>This administration page doesn’t exist.</p>
      </ErrorPage>
    </main>
  );
}
