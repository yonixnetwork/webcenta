import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";

/** Data export for the signed-in user (GDPR-style access request). */
export async function GET() {
  const u = await getCurrentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const [user, favorites, collections, reviews, interests, history, notifications, reports, logins] = await Promise.all([
    db.user.findUnique({ where: { id: u.id }, select: { id: true, email: true, name: true, createdAt: true, personalizationEnabled: true, historyEnabled: true, emailNotifications: true, preferredCountry: true, maxAgeRating: true } }),
    db.favorite.findMany({ where: { userId: u.id }, select: { createdAt: true, listing: { select: { slug: true, name: true } } } }),
    db.collection.findMany({ where: { ownerId: u.id }, select: { title: true, description: true, visibility: true, items: { select: { listing: { select: { slug: true } } } } } }),
    db.review.findMany({ where: { userId: u.id }, select: { rating: true, title: true, body: true, status: true, createdAt: true, listing: { select: { slug: true } } } }),
    db.userInterest.findMany({ where: { userId: u.id }, select: { source: true, weight: true, category: { select: { slug: true } } } }),
    db.interactionEvent.findMany({ where: { userId: u.id }, select: { type: true, createdAt: true, query: true, listing: { select: { slug: true } } }, take: 5000 }),
    db.notification.findMany({ where: { userId: u.id }, select: { type: true, title: true, createdAt: true } }),
    db.report.findMany({ where: { reporterId: u.id }, select: { targetType: true, reason: true, status: true, createdAt: true } }),
    db.authEvent.findMany({ where: { userId: u.id }, select: { type: true, createdAt: true, ipAddress: true, userAgent: true } }),
  ]);
  const body = JSON.stringify({ exportedAt: new Date(), user, favorites, collections, reviews, interests, history, notifications, reports, signInActivity: logins }, null, 2);
  return new Response(body, { headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="webcenter-data.json"', "cache-control": "no-store" } });
}
