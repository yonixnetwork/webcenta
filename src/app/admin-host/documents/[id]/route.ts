import { db } from "@/server/db";
import { getAdmin } from "@/server/admin/auth";
import { can } from "@/server/admin/permissions";
import { storage } from "@/server/storage";
import { audit } from "@/server/audit";

/** Private compliance documents: admins with developer-verification permission only; every access is audited. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin || !can(admin.role, "developers.verify")) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const doc = await db.complianceDocument.findUnique({ where: { id }, include: { asset: true } });
  if (!doc?.asset) return new Response("Not found", { status: 404 });
  const body = await storage().get(doc.asset.storageKey);
  if (!body) return new Response("Not found", { status: 404 });
  await audit({ actorType: "ADMIN", adminId: admin.id, action: "compliance.document.view", targetType: "ComplianceDocument", targetId: id });
  return new Response(body as unknown as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": "inline", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
}
