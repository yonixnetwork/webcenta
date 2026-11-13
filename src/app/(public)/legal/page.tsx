import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PUBLIC_POLICIES } from "@/server/setup/legal-texts";

export const metadata: Metadata = { title: "Policies", description: "Webcenta's terms, privacy, content, review, submission, verification, reporting and advertising policies.", alternates: { canonical: "/legal" } };

const VERSIONED = [
  ["terms", "Terms of Service", "The agreement for using Webcenta."],
  ["privacy", "Privacy Policy", "What data we collect, why, and your rights."],
  ["cookies", "Cookie Policy", "The cookies we use and how to change your choice."],
  ["content", "Content Policy", "What is allowed in listings, reviews and other content."],
  ["reviews", "Review Guidelines", "How to write fair, useful reviews."],
  ["developers", "Developer Agreement", "Terms for developers who list apps."],
] as const;

export default function PoliciesIndex() {
  const rows = [...VERSIONED.map(([slug, title, summary]) => ({ slug, title, summary })), ...Object.entries(PUBLIC_POLICIES).map(([slug, p]) => ({ slug, title: p.title, summary: p.summary }))];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Policies</h1>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.slug}>
            <Link href={`/legal/${r.slug}`} className="flex items-center gap-3 p-4 hover:bg-surface-2">
              <span className="min-w-0 flex-1"><span className="block font-semibold">{r.title}</span><span className="block text-sm text-muted">{r.summary}</span></span>
              <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
