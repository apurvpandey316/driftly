CREATE TYPE "public"."diff_kind" AS ENUM('missing', 'extra', 'modified');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('development', 'staging', 'production', 'custom');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('postgresql', 'supabase');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('open', 'acknowledged');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('info', 'warning', 'breaking');--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" "provider" NOT NULL,
	"environment" "environment" NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 5432 NOT NULL,
	"database" text NOT NULL,
	"username" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"ssl_mode" text DEFAULT 'require' NOT NULL,
	"included_schemas" text[] DEFAULT '{"public"}' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_ok" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "differences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"object_path" text NOT NULL,
	"object_kind" text NOT NULL,
	"kind" "diff_kind" NOT NULL,
	"severity" "severity" DEFAULT 'info' NOT NULL,
	"expected" jsonb,
	"actual" jsonb,
	"note" text,
	"suggested_action" text
);
--> statement-breakpoint
CREATE TABLE "review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"difference_id" uuid NOT NULL,
	"status" "review_status" NOT NULL,
	"comment" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reference_connection_id" uuid NOT NULL,
	"target_connection_id" uuid NOT NULL,
	"scope" jsonb NOT NULL,
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"reference_snapshot" jsonb,
	"target_snapshot" jsonb,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_count" integer DEFAULT 0 NOT NULL,
	"extra_count" integer DEFAULT 0 NOT NULL,
	"modified_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "differences" ADD CONSTRAINT "differences_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_difference_id_differences_id_fk" FOREIGN KEY ("difference_id") REFERENCES "public"."differences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_reference_connection_id_connections_id_fk" FOREIGN KEY ("reference_connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_target_connection_id_connections_id_fk" FOREIGN KEY ("target_connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;