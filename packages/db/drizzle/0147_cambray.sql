-- Cambray's own schema, in one migration that is safe to re-run: an instance that
-- already has these tables from the earlier Cambray migrations (0135-0140 before the
-- v1.4 upgrade) skips each statement. A column added to a table after it was first
-- created (north_star) has its own ADD COLUMN, since CREATE TABLE IF NOT EXISTS skips it.
CREATE TABLE IF NOT EXISTS "finance_year" (
	"start_month" text PRIMARY KEY NOT NULL,
	"revenue_target_pence" integer NOT NULL,
	"project_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_year_format_check" CHECK ("finance_year"."start_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "finance_year_target_check" CHECK ("finance_year"."revenue_target_pence" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_month" (
	"month" text PRIMARY KEY NOT NULL,
	"break_even_pence" integer NOT NULL,
	"pool_percent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_month_format_check" CHECK ("performance_month"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "performance_month_break_even_check" CHECK ("performance_month"."break_even_pence" >= 0),
	CONSTRAINT "performance_month_pool_check" CHECK ("performance_month"."pool_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracker_entry" (
	"id" serial PRIMARY KEY NOT NULL,
	"measure_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"actual" double precision,
	"done" boolean,
	"note" text DEFAULT '' NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"entered_by_user_id" text,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restated_at" timestamp with time zone,
	"previous_actual" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracker_measure" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"initiative_id" integer,
	"company" text NOT NULL,
	"loop" text NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL,
	"kind" text NOT NULL,
	"unit" text NOT NULL,
	"direction" text DEFAULT 'at_least' NOT NULL,
	"cadence" text DEFAULT 'week' NOT NULL,
	"unlock_periods" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"owner_user_id" text,
	"starts_on" date NOT NULL,
	"north_star" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracker_measure_kind_check" CHECK ("tracker_measure"."kind" IN ('activity', 'engagement', 'outcome', 'guardrail', 'gate')),
	CONSTRAINT "tracker_measure_unit_check" CHECK ("tracker_measure"."unit" IN ('count', 'money', 'percent', 'done')),
	CONSTRAINT "tracker_measure_direction_check" CHECK ("tracker_measure"."direction" IN ('at_least', 'at_most')),
	CONSTRAINT "tracker_measure_cadence_check" CHECK ("tracker_measure"."cadence" IN ('week', 'month')),
	CONSTRAINT "tracker_measure_source_check" CHECK ("tracker_measure"."source" IN ('manual', 'billings', 'tickets_completed')),
	CONSTRAINT "tracker_measure_unlock_check" CHECK ("tracker_measure"."unlock_periods" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracker_target_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"measure_id" integer NOT NULL,
	"effective_from" date NOT NULL,
	"rule" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"changed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracker_measure" ADD COLUMN IF NOT EXISTS "north_star" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN IF NOT EXISTS "target_pence" integer;
--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN IF NOT EXISTS "billing_model" text;
--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN IF NOT EXISTS "day_rate_pence" integer;
--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN IF NOT EXISTS "value_override_pence" integer;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "internal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_year" ADD CONSTRAINT "finance_year_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tracker_entry" ADD CONSTRAINT "tracker_entry_measure_id_tracker_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."tracker_measure"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tracker_entry" ADD CONSTRAINT "tracker_entry_entered_by_user_id_user_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tracker_measure" ADD CONSTRAINT "tracker_measure_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tracker_measure" ADD CONSTRAINT "tracker_measure_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tracker_measure" ADD CONSTRAINT "tracker_measure_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tracker_target_version" ADD CONSTRAINT "tracker_target_version_measure_id_tracker_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."tracker_measure"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tracker_target_version" ADD CONSTRAINT "tracker_target_version_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tracker_entry_period_idx" ON "tracker_entry" USING btree ("measure_id","period_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracker_measure_project_idx" ON "tracker_measure" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracker_target_version_measure_idx" ON "tracker_target_version" USING btree ("measure_id","effective_from");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "initiative" ADD CONSTRAINT "initiative_billing_model_check" CHECK ("initiative"."billing_model" IN ('day_rate', 'retainer', 'rev_share', 'internal'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "initiative" ADD CONSTRAINT "initiative_day_rate_check" CHECK ("initiative"."day_rate_pence" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
