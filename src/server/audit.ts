import type { Prisma } from "@/generated/prisma/client";
import type { ActorType } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/** Append-only audit trail. Never pass secrets or full personal data in metadata. */
export async function audit(entry: {
  actorType: ActorType; adminId?: string | null; actorUserId?: string | null; action: string;
  targetType?: string; targetId?: string; metadata?: Prisma.InputJsonValue; ipAddress?: string | null; userAgent?: string | null;
}, tx: Prisma.TransactionClient | typeof db = db) {
  await tx.auditLog.create({ data: { ...entry, adminId: entry.adminId ?? null, actorUserId: entry.actorUserId ?? null } });
}
