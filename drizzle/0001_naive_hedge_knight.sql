ALTER TABLE "differences" ADD COLUMN "diff_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "differences" ADD COLUMN "schema_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "differences" ADD COLUMN "table_name" text;--> statement-breakpoint
ALTER TABLE "differences" ADD COLUMN "changes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "reference_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "reference_environment" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "target_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "target_environment" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "summary" jsonb;