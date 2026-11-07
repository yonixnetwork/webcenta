import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { AppCard } from "@/components/app-card";
import { Rail } from "@/components/rail";
import { SearchBox } from "@/components/search-box";
import { EmptyState } from "@/components/states";
import { getCategoryTree } from "@/server/catalog/categories";
import { getHomepage } from "@/server/catalog/homepage";
import { getViewerContext } from "@/server/viewer";
import { getCurrentUser } from "@/server/auth/session";
import { personalRails } from "@/server/personalization/recommend";

export default async function HomePage() {
  const ctx = await getViewerContext();
  const user = await getCurrentUser();
  const [{ rails, collections }, tree, personal] = await Promise.all([getHomepage(ctx), getCategoryTree(), user ? personalRails(user, ctx) : Promise.resolve([])]);
  const suggested = tree.slice(0, 6).map((c) => c.name);

  return (
    <div className="space-y-14">
      <section className="hero-glow -mx-4 -mt-6 px-4 pb-10 pt-12 sm:mx-0 sm:mt-0 sm:rounded-[2rem] sm:border sm:border-border sm:px-8 sm:pb-14 sm:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-brand" aria-hidden /> The discovery store for the open web
          </p>
          <h1 className="mt-5 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Find the right web app for <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">anything</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-muted">
            Browse and compare websites, AI tools, games and online services, and see alternatives before you visit.
          </p>
          <div className="mx-auto mt-8 max-w-2xl text-left"><SearchBox size="lg" suggested={suggested} /></div>
          <p className="mt-4 text-balance text-xs text-subtle">
            <ShieldCheck className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />Every listing credits its publisher, and you see a notice before leaving Webcenta.
          </p>
        </div>
      </section>

      <section aria-labelledby="browse-categories" className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 id="browse-categories" className="text-xl font-bold tracking-tight sm:text-2xl">Browse categories</h2>
          <Link href="/categories" className="text-sm font-semibold text-brand hover:underline">All categories</Link>
        </div>
        <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {tree.slice(0, 16).map((c) => (
            <li key={c.id} className="shrink-0">
              <Link href={`/c/${c.slug}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium shadow-card transition hover:border-brand/40 hover:text-brand">
                <CategoryIcon icon={c.icon} className="size-4 text-brand" /> {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {personal.length > 0 && (
        <div className="space-y-14">
          {personal.map((r) => <Rail key={r.key} title={r.title} items={r.items} />)}
          <p className="-mt-8 text-xs text-subtle">Personalised from your activity on Webcenta. <a href="/account/privacy" className="underline">Manage personalisation</a></p>
        </div>
      )}

      {rails.length === 0 && collections.length === 0 ? (
        <EmptyState title="The catalogue is being prepared">
          Listings appear here once they have been reviewed and published. Check back soon.
        </EmptyState>
      ) : (
        rails.map((r) => <Rail key={r.key} title={r.title} subtitle={r.subtitle} href={r.href} items={r.items} sponsoredIds={r.sponsoredIds} />)
      )}

      {collections.length > 0 && (
        <section aria-labelledby="collections" className="space-y-5">
          <h2 id="collections" className="text-xl font-bold tracking-tight sm:text-2xl">Curated collections</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            {collections.map((c) => (
              <div key={c.slug} className="rounded-3xl border border-border bg-gradient-to-br from-brand-soft to-surface p-5 shadow-card">
                <h3 className="text-lg font-bold"><Link href={`/collections/${c.slug}`} className="hover:text-brand">{c.title} →</Link></h3>
                {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                <ul className="mt-4 grid grid-cols-2 gap-3">
                  {c.items.slice(0, 4).map((a) => <li key={a.id}><AppCard app={a} compact /></li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
