import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import type { DeveloperMemberRole } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { requireUser, type CurrentUser } from "@/server/auth/session";

export interface DevContext {
  user: CurrentUser;
  org: NonNullable<Awaited<ReturnType<typeof db.developerOrg.findUnique>>>;
  role: DeveloperMemberRole;
  orgs: Array<{ id: string; displayName: string }>;
}

const ROLE_RANK: Record<DeveloperMemberRole, number> = { ANALYST: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };
export const canRole = (role: DeveloperMemberRole, min: DeveloperMemberRole) => ROLE_RANK[role] >= ROLE_RANK[min];

/** Current developer organisation (cookie-selected) for the signed-in user, or null if they have none. */
export async function getDevContext(next = "/"): Promise<DevContext | null> {
  const user = await requireUser(next);
  const memberships = await db.developerMember.findMany({ where: { userId: user.id }, include: { org: true }, orderBy: { createdAt: "asc" } });
  if (!memberships.length) return null;
  const wanted = (await cookies()).get("wc-dev-org")?.value;
  const m = memberships.find((x) => x.orgId === wanted) ?? memberships[0]!;
  return { user, org: m.org, role: m.role, orgs: memberships.map((x) => ({ id: x.org.id, displayName: x.org.displayName })) };
}

export async function requireDev(min: DeveloperMemberRole = "ANALYST", next = "/"): Promise<DevContext> {
  const ctx = await getDevContext(next);
  if (!ctx) redirect("/");
  if (!canRole(ctx.role, min)) throw new Error("FORBIDDEN");
  return ctx;
}

/** For pages: like requireDev, but renders the 403 page when the role is insufficient. */
export async function requireDevPage(min: DeveloperMemberRole = "ANALYST", next = "/"): Promise<DevContext> {
  const ctx = await getDevContext(next);
  if (!ctx) redirect("/");
  if (!canRole(ctx.role, min)) forbidden();
  return ctx;
}

/** Ensures the listing belongs to the current org. */
export async function devListing(ctx: DevContext, listingId: string) {
  const l = await db.listing.findFirst({ where: { id: listingId, developerId: ctx.org.id } });
  if (!l) throw new Error("NOT_FOUND");
  return l;
}
