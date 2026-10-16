-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeatureKind" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('PER_PERSON', 'PER_GROUP', 'PER_PERSON_PER_DAY', 'PER_GROUP_PER_DAY', 'PER_PACKAGE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "EnquiryType" AS ENUM ('CONTACT', 'PACKAGE', 'CUSTOM_TRIP');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTE_PREPARATION', 'QUOTE_SENT', 'CONFIRMED', 'CLOSED', 'SPAM');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('ESTIMATED', 'QUOTE_REQUIRED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('INTERNAL_NOTIFICATION', 'CUSTOMER_ACKNOWLEDGEMENT', 'PASSWORD_RESET', 'DELIVERY_FAILURE_ALERT', 'TEST');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('SUCCESS', 'RETRYABLE_ERROR', 'PERMANENT_ERROR', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ERROR');

-- CreateTable
CREATE TABLE "staff_user" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_session" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_account" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limit" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "auth_rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_throttle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_throttle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "credit" TEXT,
    "license" TEXT,
    "licenseUrl" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bestSeason" TEXT,
    "recommendedDuration" TEXT,
    "travelTips" TEXT,
    "heroImageId" UUID,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination_image" (
    "destinationId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "destination_image_pkey" PRIMARY KEY ("destinationId","mediaId")
);

-- CreateTable
CREATE TABLE "attraction" (
    "id" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "attraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "durationNights" INTEGER NOT NULL,
    "idealFor" TEXT,
    "accommodationInfo" TEXT,
    "transportInfo" TEXT,
    "availabilityNotes" TEXT,
    "cancellationPolicy" TEXT,
    "heroImageId" UUID,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_destination" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,

    CONSTRAINT "package_destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_day" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "overnight" TEXT,

    CONSTRAINT "itinerary_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_image" (
    "packageId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "package_image_pkey" PRIMARY KEY ("packageId","mediaId")
);

-- CreateTable
CREATE TABLE "package_feature" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "kind" "FeatureKind" NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "package_feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rule" (
    "id" UUID NOT NULL,
    "destinationId" UUID,
    "packageId" UUID,
    "label" TEXT NOT NULL,
    "basis" "PricingBasis" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "childAmountPaise" INTEGER,
    "includedTravellers" INTEGER,
    "seasonStart" TEXT,
    "seasonEnd" TEXT,
    "validFrom" DATE,
    "validTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_addon" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basis" "PricingBasis" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "package_addon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_code" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minSubtotalPaise" INTEGER,
    "maxDiscountPaise" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discountLabel" TEXT,
    "packageId" UUID,
    "promoCodeId" UUID,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "EnquiryType" NOT NULL,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT,
    "packageId" UUID,
    "travelStartDate" DATE,
    "travelMonth" TEXT,
    "durationDays" INTEGER,
    "adults" INTEGER,
    "children" INTEGER,
    "accommodationPreference" TEXT,
    "transportPreference" TEXT,
    "interests" TEXT[],
    "budget" TEXT,
    "promoCode" TEXT,
    "estimateStatus" "EstimateStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "estimateTotalPaise" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "snapshot" JSONB NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "sourcePage" TEXT,
    "ipHash" TEXT,
    "assigneeId" UUID,
    "followUpAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_destination" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "destinationId" UUID,
    "nameSnapshot" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,

    CONSTRAINT "enquiry_destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_note" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_status_history" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "fromStatus" "EnquiryStatus",
    "toStatus" "EnquiryStatus" NOT NULL,
    "changedById" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "enquiryId" UUID,
    "toAddress" TEXT NOT NULL,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_attempt" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_delivery_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmail_credential" (
    "id" TEXT NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedById" UUID,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "testimonial" (
    "id" UUID NOT NULL,
    "authorName" TEXT NOT NULL,
    "location" TEXT,
    "quote" TEXT NOT NULL,
    "rating" INTEGER,
    "source" TEXT,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq" (
    "id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_email_key" ON "staff_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_key" ON "auth_session"("token");

-- CreateIndex
CREATE INDEX "auth_session_userId_idx" ON "auth_session"("userId");

-- CreateIndex
CREATE INDEX "auth_account_userId_idx" ON "auth_account"("userId");

-- CreateIndex
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "auth_rate_limit_key_key" ON "auth_rate_limit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_path_key" ON "media_asset"("path");

-- CreateIndex
CREATE UNIQUE INDEX "destination_slug_key" ON "destination"("slug");

-- CreateIndex
CREATE INDEX "destination_status_sortOrder_idx" ON "destination"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "attraction_destinationId_position_idx" ON "attraction"("destinationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "package_slug_key" ON "package"("slug");

-- CreateIndex
CREATE INDEX "package_status_featured_sortOrder_idx" ON "package"("status", "featured", "sortOrder");

-- CreateIndex
CREATE INDEX "package_destination_destinationId_idx" ON "package_destination"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "package_destination_packageId_position_key" ON "package_destination"("packageId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_day_packageId_dayNumber_key" ON "itinerary_day"("packageId", "dayNumber");

-- CreateIndex
CREATE INDEX "package_feature_packageId_kind_position_idx" ON "package_feature"("packageId", "kind", "position");

-- CreateIndex
CREATE INDEX "pricing_rule_destinationId_active_idx" ON "pricing_rule"("destinationId", "active");

-- CreateIndex
CREATE INDEX "pricing_rule_packageId_active_idx" ON "pricing_rule"("packageId", "active");

-- CreateIndex
CREATE INDEX "package_addon_packageId_position_idx" ON "package_addon"("packageId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "promo_code_code_key" ON "promo_code"("code");

-- CreateIndex
CREATE INDEX "offer_status_sortOrder_idx" ON "offer"("status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_reference_key" ON "enquiry"("reference");

-- CreateIndex
CREATE INDEX "enquiry_status_createdAt_idx" ON "enquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "enquiry_type_createdAt_idx" ON "enquiry"("type", "createdAt");

-- CreateIndex
CREATE INDEX "enquiry_createdAt_idx" ON "enquiry"("createdAt");

-- CreateIndex
CREATE INDEX "enquiry_email_idx" ON "enquiry"("email");

-- CreateIndex
CREATE INDEX "enquiry_followUpAt_idx" ON "enquiry"("followUpAt");

-- CreateIndex
CREATE INDEX "enquiry_destination_destinationId_idx" ON "enquiry_destination"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_destination_enquiryId_position_key" ON "enquiry_destination"("enquiryId", "position");

-- CreateIndex
CREATE INDEX "enquiry_note_enquiryId_createdAt_idx" ON "enquiry_note"("enquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "enquiry_status_history_enquiryId_createdAt_idx" ON "enquiry_status_history"("enquiryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_idempotencyKey_key" ON "email_delivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "email_delivery_status_nextAttemptAt_idx" ON "email_delivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "email_delivery_enquiryId_idx" ON "email_delivery"("enquiryId");

-- CreateIndex
CREATE INDEX "email_delivery_attempt_deliveryId_attemptNumber_idx" ON "email_delivery_attempt"("deliveryId", "attemptNumber");

-- CreateIndex
CREATE INDEX "testimonial_status_sortOrder_idx" ON "testimonial"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "faq_status_sortOrder_idx" ON "faq"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "staff_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "staff_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination" ADD CONSTRAINT "destination_heroImageId_fkey" FOREIGN KEY ("heroImageId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination_image" ADD CONSTRAINT "destination_image_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination_image" ADD CONSTRAINT "destination_image_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attraction" ADD CONSTRAINT "attraction_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package" ADD CONSTRAINT "package_heroImageId_fkey" FOREIGN KEY ("heroImageId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_destination" ADD CONSTRAINT "package_destination_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_destination" ADD CONSTRAINT "package_destination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_day" ADD CONSTRAINT "itinerary_day_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_image" ADD CONSTRAINT "package_image_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_image" ADD CONSTRAINT "package_image_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_feature" ADD CONSTRAINT "package_feature_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_addon" ADD CONSTRAINT "package_addon_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_destination" ADD CONSTRAINT "enquiry_destination_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_destination" ADD CONSTRAINT "enquiry_destination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_note" ADD CONSTRAINT "enquiry_note_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_note" ADD CONSTRAINT "enquiry_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_status_history" ADD CONSTRAINT "enquiry_status_history_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_status_history" ADD CONSTRAINT "enquiry_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "staff_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_attempt" ADD CONSTRAINT "email_delivery_attempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "email_delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Integrity constraints not expressible in the Prisma schema ───────────────

-- A pricing rule belongs to exactly one destination or one package.
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_single_owner"
  CHECK ((("destinationId" IS NOT NULL)::int + ("packageId" IS NOT NULL)::int) = 1);
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_amounts_non_negative"
  CHECK ("amountPaise" >= 0 AND ("childAmountPaise" IS NULL OR "childAmountPaise" >= 0));
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_package_travellers"
  CHECK ("basis" <> 'PER_PACKAGE' OR ("includedTravellers" IS NOT NULL AND "includedTravellers" > 0));
ALTER TABLE "pricing_rule" ADD CONSTRAINT "pricing_rule_season_format"
  CHECK (("seasonStart" IS NULL AND "seasonEnd" IS NULL)
      OR ("seasonStart" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' AND "seasonEnd" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'));

ALTER TABLE "package_addon" ADD CONSTRAINT "package_addon_amount_non_negative" CHECK ("amountPaise" >= 0);
ALTER TABLE "package" ADD CONSTRAINT "package_duration_positive" CHECK ("durationDays" > 0 AND "durationNights" >= 0);
ALTER TABLE "package_destination" ADD CONSTRAINT "package_destination_days_positive" CHECK ("days" > 0);

ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_value_valid"
  CHECK (("discountType" = 'PERCENT' AND "value" BETWEEN 1 AND 100) OR ("discountType" = 'FIXED' AND "value" > 0));
ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_upper" CHECK ("code" = upper("code"));

ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_travellers_valid"
  CHECK (("adults" IS NULL OR "adults" >= 1) AND ("children" IS NULL OR "children" >= 0));
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_estimate_consistent"
  CHECK (("estimateStatus" = 'ESTIMATED') = ("estimateTotalPaise" IS NOT NULL));
ALTER TABLE "enquiry_destination" ADD CONSTRAINT "enquiry_destination_days_positive" CHECK ("days" > 0);

ALTER TABLE "testimonial" ADD CONSTRAINT "testimonial_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
-- A testimonial can only be published after staff confirm it is genuine and authorised.
ALTER TABLE "testimonial" ADD CONSTRAINT "testimonial_published_requires_consent"
  CHECK ("status" <> 'PUBLISHED' OR "consentConfirmed" = true);
