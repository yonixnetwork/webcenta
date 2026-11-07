-- AlterTable
ALTER TABLE "AdminInvitation" ADD COLUMN     "pendingTotpEnc" TEXT,
ALTER COLUMN "invitedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "totpLastStep" INTEGER;

-- AlterTable
ALTER TABLE "Sponsorship" ADD COLUMN     "decisionNotes" TEXT,
ADD COLUMN     "message" TEXT,
ADD COLUMN     "slot" "PlacementSlot" NOT NULL DEFAULT 'HOME_FEATURED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adultConfirmedAt" TIMESTAMPTZ,
ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthRateLimit_key_key" ON "AuthRateLimit"("key");

-- CreateIndex
CREATE INDEX "EmailMessage_status_createdAt_idx" ON "EmailMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_to_createdAt_idx" ON "EmailMessage"("to", "createdAt");

-- CreateIndex
CREATE INDEX "ListingEvent_listingId_type_visitorHash_occurredAt_idx" ON "ListingEvent"("listingId", "type", "visitorHash", "occurredAt");

-- HAND-WRITTEN (standard footer for every migration; idempotent):
-- RLS on every table in "public" and no privileges for Supabase Data API roles.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;
