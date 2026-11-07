import { CardGrid } from "@/components/rail";
import { EmptyState } from "@/components/states";
import { buttonClass } from "@/components/ui/button";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { cardsByIds } from "@/server/catalog/listings";
import { getViewerContext } from "@/server/viewer";
import { clearHistoryAction } from "@/server/actions/user";

export default async function HistoryPage() {
  const user = await requireUser("/account/history");
  const events = await db.interactionEvent.findMany({ where: { userId: user.id, type: "LISTING_VIEW", listingId: { not: null } }, orderBy: { createdAt: "desc" }, take: 200, select: { listingId: true } });
  const ids = [...new Set(events.map((e) => e.listingId!))].slice(0, 30);
  const cards = await cardsByIds(await getViewerContext(), ids);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Recently viewed</h1>
        {cards.length > 0 && <form action={clearHistoryAction}><button className={buttonClass("secondary", "sm")}>Clear history</button></form>}
      </div>
      {!user.historyEnabled && <p className="text-sm text-muted">Browsing history is turned off in Privacy & data.</p>}
      {cards.length ? <CardGrid items={cards} /> : <EmptyState title="Nothing here yet">Apps you open while signed in appear here. Only you can see this list.</EmptyState>}
    </>
  );
}
