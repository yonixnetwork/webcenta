-- CreateTable
CREATE TABLE `CountryPolicy` (
    `country` CHAR(2) NOT NULL,
    `restrictedCategories` JSON NOT NULL,
    `permittedCategories` JSON NOT NULL,
    `adultAge` INTEGER NULL,
    `adsDisabled` BOOLEAN NOT NULL DEFAULT false,
    `disabledProviders` JSON NOT NULL,
    `lastReviewedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`country`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdReport` (
    `id` VARCHAR(191) NOT NULL,
    `placement` VARCHAR(40) NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `pagePath` VARCHAR(300) NOT NULL,
    `country` CHAR(2) NULL,
    `reason` VARCHAR(40) NOT NULL,
    `details` VARCHAR(1000) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',
    `resolution` VARCHAR(500) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdReport_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CategoryTranslation` (
    `categoryId` VARCHAR(191) NOT NULL,
    `locale` VARCHAR(16) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `reviewed` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CategoryTranslation_locale_idx`(`locale`),
    PRIMARY KEY (`categoryId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LocaleSeo` (
    `locale` VARCHAR(16) NOT NULL,
    `title` VARCHAR(70) NULL,
    `description` VARCHAR(170) NULL,
    `keywords` JSON NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
