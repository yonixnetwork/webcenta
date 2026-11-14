-- AlterTable
ALTER TABLE `AdminSession` ADD COLUMN `stepUpAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `ImportCandidate` ADD COLUMN `duplicateOfListingId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ListingRevision` ADD COLUMN `changeSummary` VARCHAR(300) NULL,
    ADD COLUMN `changedFields` JSON NULL;

-- CreateTable
CREATE TABLE `SecurityEvent` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `severity` VARCHAR(10) NOT NULL DEFAULT 'info',
    `source` VARCHAR(191) NOT NULL,
    `detail` VARCHAR(500) NULL,
    `hour` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `firstAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `alertedAt` DATETIME(3) NULL,

    INDEX `SecurityEvent_hour_idx`(`hour`),
    INDEX `SecurityEvent_type_hour_idx`(`type`, `hour`),
    UNIQUE INDEX `SecurityEvent_type_source_hour_key`(`type`, `source`, `hour`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

