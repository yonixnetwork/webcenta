import { Logo } from "@/components/logo";
import { AdminNav } from "@/components/portal/admin-nav";
import { AdminLogoutButton } from "@/components/portal/admin-logout";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { can, ROLE_LABEL, type Permission } from "@/server/admin/permissions";
import { adminLogoutAction } from "@/server/actions/admin";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const [pending, reports, alerts] = await Promise.all([
    db.listingRevision.count({ where: { status: { in: ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"] } } }),
    db.report.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    db.securityAlert.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
  ]);
  const all: Array<{ href: string; label: string; perm?: Permission; badge?: number }> = [
    { href: "/", label: "Overview" },
    { href: "/submissions", label: "Submissions", perm: "listings.moderate", badge: pending },
    { href: "/listings", label: "Applications", perm: "listings.moderate" },
    { href: "/reports", label: "Reports", perm: "content.moderate", badge: reports },
    { href: "/reviews", label: "Reviews", perm: "content.moderate" },
    { href: "/appeals", label: "Appeals", perm: "content.moderate" },
    { href: "/claims", label: "Claims", perm: "developers.verify" },
    { href: "/security", label: "Security", perm: "security.manage", badge: alerts },
    { href: "/users", label: "Users", perm: "users.view" },
    { href: "/developers", label: "Developers", perm: "developers.verify" },
    { href: "/support", label: "Support", perm: "support.manage" },
    { href: "/analytics", label: "Analytics", perm: "analytics.view" },
    { href: "/categories", label: "Categories", perm: "catalog.manage" },
    { href: "/homepage", label: "Homepage & curation", perm: "catalog.manage" },
    { href: "/monetization", label: "Monetisation", perm: "monetization.manage" },
    { href: "/settings", label: "Settings & legal", perm: "settings.manage" },
    { href: "/admins", label: "Administrators", perm: "admins.manage" },
    { href: "/audit", label: "Audit log", perm: "audit.view" },
    { href: "/jobs", label: "Jobs & email", perm: "jobs.view" },
  ];
  const items = all.filter((i) => !i.perm || can(admin.role, i.perm));
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3"><Logo /><span className="rounded-md bg-danger-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-danger">Admin</span></div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">{admin.name} · <strong className="text-text">{ROLE_LABEL[admin.role]}</strong></span>
          <AdminLogoutButton action={adminLogoutAction} />
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside><AdminNav items={items} /></aside>
        <main className="min-w-0 space-y-6">{children}</main>
      </div>
    </div>
  );
}
