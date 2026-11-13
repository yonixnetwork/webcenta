-- AlterTable
ALTER TABLE `DomainVerification` ADD COLUMN `challengeExpiresAt` DATETIME(3) NULL,
    MODIFY `method` ENUM('DNS_TXT', 'HTML_META', 'WELL_KNOWN_FILE', 'HTML_FILE') NOT NULL;

-- AlterTable
ALTER TABLE `ImportCandidate` ADD COLUMN `errorCategory` VARCHAR(40) NULL,
    ADD COLUMN `failedStage` VARCHAR(40) NULL,
    ADD COLUMN `retryable` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `Job` ADD COLUMN `durationMs` INTEGER NULL,
    ADD COLUMN `result` JSON NULL,
    ADD COLUMN `startedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `JobRun` ADD COLUMN `enqueued` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `recovered` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `skipped` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `trigger` VARCHAR(20) NOT NULL DEFAULT 'cron';

-- AlterTable
ALTER TABLE `Listing` ADD COLUMN `enrichedAt` DATETIME(3) NULL,
    ADD COLUMN `enrichmentResult` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `PushSubscription` ADD COLUMN `lastError` VARCHAR(300) NULL,
    ADD COLUMN `lastFailureAt` DATETIME(3) NULL,
    ADD COLUMN `lastStatus` INTEGER NULL,
    ADD COLUMN `lastSyncedAt` DATETIME(3) NULL,
    ADD COLUMN `platform` VARCHAR(40) NULL,
    ADD COLUMN `standalone` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `PushDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NULL,
    `subscriptionId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `outcome` VARCHAR(20) NOT NULL,
    `statusCode` INTEGER NULL,
    `category` VARCHAR(40) NULL,
    `platform` VARCHAR(40) NULL,
    `kind` VARCHAR(20) NOT NULL DEFAULT 'CAMPAIGN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PushDelivery_createdAt_idx`(`createdAt`),
    INDEX `PushDelivery_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

