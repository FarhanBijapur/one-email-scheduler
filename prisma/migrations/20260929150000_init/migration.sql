-- CreateEnum
CREATE TYPE "EmailBatchStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "google_sub" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "team_id" TEXT NOT NULL,
    "team_name" TEXT,
    "access_token" TEXT NOT NULL,
    "channel_id" TEXT,
    "channel_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slack_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_batches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "delay_between_emails" INTEGER NOT NULL,
    "hourly_limit" INTEGER NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "status" "EmailBatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_batches_delay_between_emails_check" CHECK ("delay_between_emails" >= 0),
    CONSTRAINT "email_batches_hourly_limit_check" CHECK ("hourly_limit" > 0),
    CONSTRAINT "email_batches_recipient_count_check" CHECK ("recipient_count" > 0)
);

-- CreateTable
CREATE TABLE "emails" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT,
    "sequence_index" INTEGER NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'SCHEDULED',
    "planned_send_at" TIMESTAMPTZ(6) NOT NULL,
    "claimed_at" TIMESTAMPTZ(6),
    "claim_token" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "emails_sequence_index_check" CHECK ("sequence_index" >= 0)
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" UUID NOT NULL,
    "email_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_attachments_size_bytes_check" CHECK ("size_bytes" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "slack_connections_user_id_team_id_key" ON "slack_connections"("user_id", "team_id");

-- CreateIndex
CREATE INDEX "email_batches_user_id_scheduled_at_idx" ON "email_batches"("user_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "email_batches_user_id_status_idx" ON "email_batches"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "emails_batch_id_recipient_key" ON "emails"("batch_id", "recipient");

-- CreateIndex
CREATE UNIQUE INDEX "emails_batch_id_sequence_index_key" ON "emails"("batch_id", "sequence_index");

-- CreateIndex
CREATE INDEX "emails_user_id_status_planned_send_at_idx" ON "emails"("user_id", "status", "planned_send_at");

-- CreateIndex
CREATE INDEX "emails_user_id_recipient_idx" ON "emails"("user_id", "recipient");

-- CreateIndex
CREATE INDEX "email_attachments_email_id_idx" ON "email_attachments"("email_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_batches" ADD CONSTRAINT "email_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "email_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
