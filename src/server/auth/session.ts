import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { auth } from "./user-auth";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  personalizationEnabled: boolean;
  historyEnabled: boolean;
  maxAgeRating: "ALL_AGES" | "AGE_13_PLUS" | "AGE_16_PLUS" | "AGE_18_PLUS";
  adultConfirmedAt: Date | null;
  preferredCountry: string | null;
  emailNotifications: boolean;
}

/** The signed-in, ACTIVE user for this request (deduplicated per request), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const h = await headers();
  if (!h.get("cookie")?.includes("wc.session_token") && !h.get("cookie")?.includes("__Secure-wc.session_token")) return null;
  const session = await auth().api.getSession({ headers: h }).catch(() => null);
  if (!session) return null;
  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, emailVerified: true, status: true, personalizationEnabled: true, historyEnabled: true,
      maxAgeRating: true, adultConfirmedAt: true, preferredCountry: true, emailNotifications: true },
  });
  if (!u || u.status !== "ACTIVE") return null;
  const { status: _status, ...rest } = u;
  return rest;
});

export async function requireUser(next = "/account"): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return u;
}

/** Developer organisations the user belongs to, with their role. */
export async function userOrgs(userId: string) {
  return db.developerMember.findMany({ where: { userId }, include: { org: true }, orderBy: { createdAt: "asc" } });
}
