import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { supportReplyAction, supportStatusAction } from "@/server/actions/admin";

export default async function SupportCasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("support.manage");
  const { id } = await params;
  const c = await db.supportCase.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" }, include: { fromAdmin: { select: { name: true } } } }, user: { select: { id: true, status: true } } } });
  if (!c) notFound();
  return (
    <>
      <Link href="/support" className="text-sm text-muted hover:text-text">← Support</Link>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-extrabold tracking-tight">{c.subject}</h1><StatusPill status={c.status} /></div>
      <p className="text-sm text-muted">{c.contactEmail}{c.user ? <> · <Link href={`/users/${c.user.id}`} className="text-brand">user account</Link></> : " · not signed in"} · opened {formatDate(c.createdAt)}</p>
      <ul className="space-y-2">{c.messages.map((m) => <li key={m.id} className={`rounded-xl p-3 text-sm ${m.isInternal ? "bg-warning-soft" : m.fromAdmin ? "bg-brand-soft/50" : "bg-surface-2"}`}><p className="text-xs text-subtle">{m.fromAdmin ? `${m.fromAdmin.name}${m.isInternal ? " (internal note)" : ""}` : c.contactEmail} · {formatDate(m.createdAt)}</p><p className="whitespace-pre-line">{m.body}</p></li>)}</ul>
      <Card>
        <ActionForm action={supportReplyAction.bind(null, c.id)} submitLabel="Send">
          <Field label="Message"><textarea name="body" required rows={4} className={inputClass} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" className="size-4 accent-[var(--brand)]" />Internal note (not emailed)</label>
        </ActionForm>
      </Card>
      <div className="flex gap-2">
        <form action={supportStatusAction.bind(null, c.id, "RESOLVED")}><button className={buttonClass("secondary", "sm")}>Mark resolved</button></form>
        <form action={supportStatusAction.bind(null, c.id, "CLOSED")}><button className={buttonClass("secondary", "sm")}>Close</button></form>
        <form action={supportStatusAction.bind(null, c.id, "OPEN")}><button className={buttonClass("ghost", "sm")}>Re-open</button></form>
      </div>
    </>
  );
}
