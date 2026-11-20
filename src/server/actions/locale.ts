"use server";

import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { normalizeLocale } from "@/i18n/locales";

/** Saves the language a signed-in user chose (the cookie alone covers visitors). */
export async function saveLocaleAction(code: string): Promise<{ ok: boolean }> {
  const locale = normalizeLocale(typeof code === "string" ? code : "");
  const user = await getCurrentUser();
  if (!locale || !user) return { ok: false };
  await db.user.update({ where: { id: user.id }, data: { locale } });
  return { ok: true };
}
