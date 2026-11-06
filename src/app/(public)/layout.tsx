import { cookies } from "next/headers";
import { MobileNav } from "@/components/mobile-nav";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCategoryTree } from "@/server/catalog/categories";
import { getCurrentUser } from "@/server/auth/session";
import { unreadCount } from "@/server/community/notifications";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const cookie = (await cookies()).get("wc-theme")?.value;
  const theme = cookie === "light" || cookie === "dark" ? cookie : "system";
  // "Suggested searches": real category names (no fabricated popularity).
  const tree = await getCategoryTree().catch(() => []);
  const user = await getCurrentUser();
  const headerUser = user ? { name: user.name, unread: await unreadCount(user.id) } : null;
  const suggested = tree.slice(0, 6).map((c) => c.name);
  const banner = process.env.SITE_BANNER ?? (process.env.NODE_ENV !== "production" ? "Development build — listings marked “Sample” are fictional." : "");
  return (
    <>
      {banner && <div className="bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning">{banner}</div>}
      <SiteHeader theme={theme} suggested={suggested} user={headerUser} />
      <main id="main" className="mx-auto min-h-[60vh] max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pb-10">{children}</main>
      <SiteFooter />
      <MobileNav />
    </>
  );
}
