import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/labels";
import { renderMarkdown } from "@/lib/markdown";
import { db } from "@/server/db";
import { PUBLIC_POLICIES } from "@/server/setup/legal-texts";

const TYPES = { terms: "TERMS_OF_SERVICE", privacy: "PRIVACY_POLICY", cookies: "COOKIE_POLICY", content: "CONTENT_POLICY", developers: "DEVELOPER_AGREEMENT", reviews: "REVIEW_GUIDELINES" } as const;
const TITLES: Record<keyof typeof TYPES, string> = { terms: "Terms of Service", privacy: "Privacy Policy", cookies: "Cookie Policy", content: "Content Policy", developers: "Developer Agreement", reviews: "Review Guidelines" };

type Props = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  const extra = PUBLIC_POLICIES[type as keyof typeof PUBLIC_POLICIES];
  if (extra) return { title: extra.title, description: extra.summary, alternates: { canonical: `/legal/${type}` } };
  return type in TYPES ? { title: TITLES[type as keyof typeof TYPES], alternates: { canonical: `/legal/${type}` } } : { title: "Not found" };
}

const prose = "mt-6 space-y-4 leading-relaxed text-muted [&_a]:text-brand [&_a]:underline [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-text [&_h3]:font-semibold [&_h3]:text-text [&_strong]:text-text [&_ul]:list-disc [&_ul]:pl-6";

export default async function LegalPage({ params }: Props) {
  const { type } = await params;
  const extra = PUBLIC_POLICIES[type as keyof typeof PUBLIC_POLICIES];
  if (extra) {
    return (
      <article className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{extra.title}</h1>
        <div className={prose} dangerouslySetInnerHTML={{ __html: renderMarkdown(extra.body) }} />
        <p className="mt-8 text-sm"><Link href="/legal" className="text-brand underline">All policies</Link></p>
      </article>
    );
  }
  if (!(type in TYPES)) notFound();
  const policy = await db.legalPolicy.findFirst({ where: { type: TYPES[type as keyof typeof TYPES], publishedAt: { not: null } }, orderBy: { version: "desc" } });
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{policy?.title ?? TITLES[type as keyof typeof TYPES]}</h1>
      {policy ? (
        <>
          <p className="mt-2 text-sm text-muted">Version {policy.version} · effective {formatDate(policy.effectiveAt)}</p>
          <div className="mt-6 space-y-4 leading-relaxed text-muted [&_a]:text-brand [&_a]:underline [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-text [&_h3]:font-semibold [&_h3]:text-text [&_strong]:text-text [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: renderMarkdown(policy.body) }} />
        </>
      ) : <p className="mt-4 rounded-xl bg-warning-soft p-4 text-sm text-warning">This policy is being finalised with legal counsel and has not been published yet. Contact us via the <Link href="/contact" className="underline">contact form</Link> with any questions.</p>}
    </article>
  );
}
