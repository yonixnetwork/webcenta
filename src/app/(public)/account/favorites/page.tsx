import Link from "next/link";
import { CardGrid } from "@/components/rail";
import { EmptyState } from "@/components/states";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { cardsByIds } from "@/server/catalog/listings";
import { getViewerContext } from "@/server/viewer";

export default async function FavoritesPage() {
  const user = await requireUser("/account/favorites");
  const favs = await db.favorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { listingId: true } });
  const cards = await cardsByIds(await getViewerContext(), favs.map((f) => f.listingId));
  const hidden = favs.length - cards.length;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Favourites</h1>
      {cards.length ? <CardGrid items={cards} /> : <EmptyState title="No favourites yet">Tap <strong>Save</strong> on any app to keep it here. <Link href="/" className="text-brand underline">Discover apps</Link></EmptyState>}
      {hidden > 0 && <p className="text-xs text-subtle">{hidden} saved app(s) are currently unavailable (removed, under review or not available in your region).</p>}
    </>
  );
}
