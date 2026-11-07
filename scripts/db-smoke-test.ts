/**
 * Schema smoke test — run against a DISPOSABLE database only.
 *   DATABASE_URL=... npm run db:smoke
 * It creates rows, asserts key constraints/cascades, and cleans up after itself.
 * Refuses to run when NODE_ENV=production.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client.js";
import assert from "node:assert/strict";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run smoke test with NODE_ENV=production");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const tag = `smoke-${Date.now()}`;
const results: string[] = [];
const ok = (name: string) => results.push(`PASS  ${name}`);

async function expectUniqueViolation(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    assert.fail(`${name}: expected unique violation`);
  } catch (e) {
    assert.ok(
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
      `${name}: expected P2002, got ${String(e)}`,
    );
    ok(name);
  }
}

async function main() {
  // Category hierarchy
  const parent = await prisma.category.create({
    data: { slug: `${tag}-crypto`, name: "Cryptocurrency", riskTier: "HIGH", requiresManualReview: true },
  });
  const child = await prisma.category.create({
    data: { slug: `${tag}-exchanges`, name: "Exchanges", parentId: parent.id, requiresComplianceDocs: true },
  });
  const tree = await prisma.category.findUniqueOrThrow({ where: { id: parent.id }, include: { children: true } });
  assert.equal(tree.children[0]?.id, child.id);
  ok("category parent/child hierarchy");

  // Parent with children cannot be deleted (onDelete: Restrict)
  await assert.rejects(prisma.category.delete({ where: { id: parent.id } }));
  ok("deleting a parent category with children is blocked");

  // Users, developer org, membership
  const dev = await prisma.user.create({ data: { email: `${tag}-dev@example.test`, name: "Dev" } });
  const reviewer = await prisma.user.create({ data: { email: `${tag}-user@example.test`, name: "User" } });
  await expectUniqueViolation("user email is unique", () =>
    prisma.user.create({ data: { email: `${tag}-user@example.test`, name: "Dup" } }),
  );
  const org = await prisma.developerOrg.create({
    data: { slug: `${tag}-org`, displayName: "Example Org", members: { create: { userId: dev.id, role: "OWNER" } } },
  });

  // Listing defaults: never public on creation
  const listing = await prisma.listing.create({
    data: {
      slug: `${tag}-app`,
      source: "DEVELOPER_SUBMITTED",
      name: "Example App",
      description: "Test listing",
      websiteUrl: "https://example.test",
      domain: "example.test",
      publisherName: "Example Org",
      developerId: org.id,
      primaryCategoryId: child.id,
      categories: { create: { categoryId: child.id, isPrimary: true } },
    },
  });
  assert.equal(listing.status, "DRAFT");
  assert.equal(listing.securityStatus, "NOT_SCANNED");
  assert.deepEqual(listing.platforms, ["WEB"]);
  ok("new listing defaults to DRAFT / NOT_SCANNED");

  // Revision numbering unique per listing
  await prisma.listingRevision.create({ data: { listingId: listing.id, revisionNumber: 1, data: { name: "Example App" } } });
  await expectUniqueViolation("revision number unique per listing", () =>
    prisma.listingRevision.create({ data: { listingId: listing.id, revisionNumber: 1, data: {} } }),
  );

  // One review per user per listing; reply is one-per-review
  const review = await prisma.review.create({ data: { listingId: listing.id, userId: reviewer.id, rating: 4, body: "Good" } });
  assert.equal(review.isVerifiedUsage, false);
  ok("reviews are not marked verified by default");
  await expectUniqueViolation("one review per user per listing", () =>
    prisma.review.create({ data: { listingId: listing.id, userId: reviewer.id, rating: 5 } }),
  );
  await prisma.reviewReply.create({ data: { reviewId: review.id, orgId: org.id, authorUserId: dev.id, body: "Thanks" } });
  await expectUniqueViolation("one developer reply per review", () =>
    prisma.reviewReply.create({ data: { reviewId: review.id, orgId: org.id, body: "Again" } }),
  );

  // Geo restriction uniqueness
  await prisma.geoRestriction.create({ data: { listingId: listing.id, countryCode: "US", reason: "test" } });
  await expectUniqueViolation("geo restriction unique per listing+country", () =>
    prisma.geoRestriction.create({ data: { listingId: listing.id, countryCode: "US", reason: "dup" } }),
  );

  // Audit log survives user deletion (no FK to User)
  const audit = await prisma.auditLog.create({
    data: { actorType: "USER", actorUserId: reviewer.id, action: "review.create", targetType: "Review", targetId: review.id },
  });
  await prisma.user.delete({ where: { id: reviewer.id } });
  assert.equal(await prisma.review.count({ where: { id: review.id } }), 0);
  assert.ok(await prisma.auditLog.findUnique({ where: { id: audit.id } }));
  ok("deleting a user cascades reviews but keeps the audit log");

  // Job queue claim with SKIP LOCKED
  await prisma.job.create({ data: { type: "smoke.test", payload: { tag }, dedupeKey: `${tag}-job` } });
  await expectUniqueViolation("job dedupe key prevents duplicate enqueue", () =>
    prisma.job.create({ data: { type: "smoke.test", payload: {}, dedupeKey: `${tag}-job` } }),
  );
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = 'smoke', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "Job" WHERE status = 'PENDING' AND "runAt" <= now() AND type = 'smoke.test'
      ORDER BY priority DESC, "runAt" LIMIT 10 FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  assert.equal(claimed.length, 1);
  ok("job claim via FOR UPDATE SKIP LOCKED");

  // Cleanup
  await prisma.job.deleteMany({ where: { type: "smoke.test" } });
  await prisma.auditLog.delete({ where: { id: audit.id } });
  await prisma.listing.delete({ where: { id: listing.id } });
  await prisma.developerOrg.delete({ where: { id: org.id } });
  await prisma.user.delete({ where: { id: dev.id } });
  await prisma.category.delete({ where: { id: child.id } });
  await prisma.category.delete({ where: { id: parent.id } });
  ok("cleanup");
}

main()
  .then(() => {
    console.log(results.join("\n"));
    console.log(`\n${results.length} checks passed`);
  })
  .catch((e) => {
    console.log(results.join("\n"));
    console.error("FAIL", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
