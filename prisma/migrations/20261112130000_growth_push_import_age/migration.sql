-- AlterTable
ALTER TABLE `SecurityCheckResult` MODIFY `check` ENUM('DNS_RESOLUTION', 'TLS_CERTIFICATE', 'HTTP_REACHABILITY', 'REDIRECT_CHAIN', 'THREAT_INTEL_URL', 'THREAT_INTEL_DOMAIN', 'PHISHING_HEURISTICS', 'IMPERSONATION', 'DOWNLOAD_BEHAVIOUR', 'CONTENT_CHANGE', 'IDENTITY_CHANGE', 'DNS_CHANGE', 'POLICY_PAGES', 'DOMAIN_VERIFICATION', 'DOMAIN_AGE', 'POLICY_CONTENT') NOT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `birthDate` DATE NULL;

-- AlterTable
ALTER TABLE `EmailMessage` ADD COLUMN `replyTo` VARCHAR(254) NULL;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `endpointHash` CHAR(64) NOT NULL,
    `endpoint` TEXT NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userAgent` VARCHAR(255) NULL,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `lastSuccessAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PushSubscription_endpointHash_key`(`endpointHash`),
    INDEX `PushSubscription_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` VARCHAR(400) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `status` ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `recipients` INTEGER NOT NULL DEFAULT 0,
    `delivered` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `cursor` VARCHAR(191) NULL,
    `createdByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `PushCampaign_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportCandidate` (
    `id` VARCHAR(191) NOT NULL,
    `urlHash` CHAR(64) NOT NULL,
    `url` VARCHAR(2000) NOT NULL,
    `domain` VARCHAR(253) NOT NULL,
    `categorySlug` VARCHAR(191) NULL,
    `name` VARCHAR(120) NULL,
    `note` TEXT NULL,
    `source` VARCHAR(40) NOT NULL DEFAULT 'admin',
    `status` ENUM('QUEUED', 'IMPORTING', 'IMPORTED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'QUEUED',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `listingId` VARCHAR(191) NULL,
    `lastError` TEXT NULL,
    `createdByAdminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ImportCandidate_urlHash_key`(`urlHash`),
    INDEX `ImportCandidate_status_priority_createdAt_idx`(`status`, `priority`, `createdAt`),
    INDEX `ImportCandidate_domain_idx`(`domain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

