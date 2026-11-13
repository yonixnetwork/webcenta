import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DeveloperHeader } from "@/components/portal/developer-header";
import { publicOrigin } from "@/lib/hosts";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: { default: "Webcenta for Developers", template: "%s · Webcenta for Developers" }, robots: { index: false, follow: false } };

/**
 * The developer portal (developers.<host>). Its own header, sign-in and session
 * (cookie "wcdev"); it never renders the marketplace homepage or the admin portal.
 */
export default async function DeveloperRoot({ children }: { children: React.ReactNode }) {
  const cookie = (await cookies()).get("wc-theme")?.value;
  const theme = cookie === "light" || cookie === "dark" ? cookie : "system";
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="min-h-dvh bg-bg">
      <DeveloperHeader theme={theme} user={user ? { name: user.name } : null} marketplaceUrl={publicOrigin()} />
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-subtle">
        Webcenta for Developers · <a href={`${publicOrigin()}/legal/developers`} className="hover:text-text">Developer agreement</a> · <a href={`${publicOrigin()}/contact`} className="hover:text-text">Support</a>
      </footer>
    </div>
  );
}
