import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";

export const metadata = { title: "Applications" };
const STATUSES = ["DRAFT", "SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW", "INFO_REQUIRED", "APPROVED", "REJECTED", "PUBLISHED", "SUSPENDED", "REMOVED"];

export default async function AdminListings({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; security?: string; page?: string }> }) {
  await requireAdmin("listings.moderate");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" as const } }, { domain: { contains: sp.q.toLowerCase() } }, { slug: { contains: sp.q.toLowerCase() } }] } : {}),
    ...(sp.status && STATUSES.includes(sp.status) ? { status: sp.status as never } : {}),
    ...(sp.security ? { securityStatus: sp.security as never } : {}),
  };
  const [rows, total] = await Promise.all([
    db.listing.findMany({ where, orderBy: { updatedAt: "desc" }, take: 50, skip: (page - 1) * 50, include: { developer: { select: { displayName: true } }, primaryCategory: { select: { name: true } } } }),
    db.listing.count({ where }),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Applications <span className="text-base font-normal text-muted">({total})</span></h1>
        <Link href="/listings/new" className={buttonClass("primary", "md")}>Add editorial listing</Link>
      </div>
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Name, domain or slug" className={`${inputClass} max-w-xs`} />
        <select name="status" defaultValue={sp.status ?? ""} className={`${inputClass} w-auto`}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>
        <select name="security" defaultValue={sp.security ?? ""} className={`${inputClass} w-auto`}><option value="">Any security status</option>{["NOT_SCANNED", "PASSED", "WARNING", "UNDER_INVESTIGATION", "RESTRICTED"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>
        <button className={buttonClass("secondary", "md")}>Filter</button>
      </form>
      <DataTable head={["App", "Domain", "Developer", "Category", "Status", "Security", "Updated"]} empty={rows.length === 0}>
        {rows.map((l) => (
          <tr key={l.id}>
            <td className={td}><Link href={`/listings/${l.id}`} className="font-semibold text-brand hover:underline">{l.name}</Link>{l.source === "EDITORIAL" && <span className="ml-1 text-xs text-subtle">editorial</span>}</td>
            <td className={td}>{l.domain}</td><td className={td}>{l.developer?.displayName ?? "—"}</td><td className={td}>{l.primaryCategory?.name ?? "—"}</td>
            <td className={td}><StatusPill status={l.status} /></td><td className={td}><StatusPill status={l.securityStatus} /></td><td className={td}>{formatDate(l.updatedAt)}</td>
          </tr>
        ))}
      </DataTable>
      {total > page * 50 && <Link href={`/listings?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`} className="text-sm font-semibold text-brand">Next page →</Link>}
    </>
  );
}
