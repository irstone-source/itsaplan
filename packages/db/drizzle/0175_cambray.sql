-- Cambray's own schema, in one migration that is safe to re-run: an instance that
-- already has these tables from earlier Cambray migrations (0135-0140 before v1.4,
-- 0147-0149 on v1.4, 0150-0153 on v1.5) skips each statement. It is numbered after upstream's
-- migrations so an upgrade applies upstream's first. A column added to a table
-- after it was first created has its own ADD COLUMN, since CREATE TABLE IF NOT
-- EXISTS skips it; a constraint is added inside a block that ignores a duplicate.
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "git_release" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"provider" text NOT NULL,
	"repository" text NOT NULL,
	"tag" text NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"url" text,
	"prerelease" boolean DEFAULT false NOT NULL,
	"target_commitish" text,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_release_project_id_provider_repository_tag_unique" UNIQUE("project_id","provider","repository","tag")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "git_release" ADD CONSTRAINT "git_release_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "git_release_project_idx" ON "git_release" USING btree ("project_id","published_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playbook_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"initiative_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_pence" integer DEFAULT 0 NOT NULL,
	"billing" text DEFAULT 'billable' NOT NULL,
	"estimate_minutes" integer,
	"cadence" text DEFAULT 'monthly' NOT NULL,
	"quarter_month" integer DEFAULT 1 NOT NULL,
	"type_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"stripe_price_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playbook_item_price_check" CHECK ("playbook_item"."price_pence" >= 0),
	CONSTRAINT "playbook_item_estimate_check" CHECK ("playbook_item"."estimate_minutes" >= 0),
	CONSTRAINT "playbook_item_billing_check" CHECK ("playbook_item"."billing" IN ('billable', 'retainer', 'non_billable')),
	CONSTRAINT "playbook_item_cadence_check" CHECK ("playbook_item"."cadence" IN ('monthly', 'quarterly', 'ad_hoc')),
	CONSTRAINT "playbook_item_quarter_month_check" CHECK ("playbook_item"."quarter_month" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playbook_item_label" (
	"item_id" integer NOT NULL,
	"label_id" integer NOT NULL,
	CONSTRAINT "playbook_item_label_item_id_label_id_pk" PRIMARY KEY("item_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN IF NOT EXISTS "capacity_minutes" integer;
--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN IF NOT EXISTS "revenue_class" text;
--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN IF NOT EXISTS "monthly_fee_pence" integer;
--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN IF NOT EXISTS "playbook_item_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playbook_item" ADD CONSTRAINT "playbook_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playbook_item" ADD CONSTRAINT "playbook_item_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playbook_item" ADD CONSTRAINT "playbook_item_type_id_issue_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."issue_type"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playbook_item_label" ADD CONSTRAINT "playbook_item_label_item_id_playbook_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."playbook_item"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playbook_item_label" ADD CONSTRAINT "playbook_item_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playbook_item_project_idx" ON "playbook_item" USING btree ("project_id","initiative_id","position");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue" ADD CONSTRAINT "issue_playbook_item_id_playbook_item_id_fk" FOREIGN KEY ("playbook_item_id") REFERENCES "public"."playbook_item"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_playbook_item_idx" ON "issue" USING btree ("playbook_item_id","cycle_id") WHERE "issue"."playbook_item_id" IS NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "initiative" ADD CONSTRAINT "initiative_revenue_class_check" CHECK ("initiative"."revenue_class" IN ('committed', 'new', 'management'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "initiative" ADD CONSTRAINT "initiative_monthly_fee_check" CHECK ("initiative"."monthly_fee_pence" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN IF NOT EXISTS "monthly_minutes" integer;
--> statement-breakpoint
ALTER TABLE "playbook_item" ADD COLUMN IF NOT EXISTS "measure" text DEFAULT '' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "initiative" ADD CONSTRAINT "initiative_monthly_minutes_check" CHECK ("initiative"."monthly_minutes" >= 0);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rize_client_map" (
	"rize_client" text PRIMARY KEY NOT NULL,
	"initiative_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rize_time_entry" (
	"id" serial PRIMARY KEY NOT NULL,
	"rize_id" text NOT NULL,
	"member_email" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"seconds" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"client_name" text,
	"project_name" text,
	"task_name" text,
	"user_id" text,
	"issue_id" integer,
	"initiative_id" integer,
	"match_source" text DEFAULT 'none' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rize_time_entry_rize_id_unique" UNIQUE("rize_id"),
	CONSTRAINT "rize_time_entry_seconds_check" CHECK ("rize_time_entry"."seconds" >= 0),
	CONSTRAINT "rize_time_entry_match_source_check" CHECK ("rize_time_entry"."match_source" IN ('auto', 'manual', 'none'))
);
--> statement-breakpoint
ALTER TABLE "issue_worklog" ADD COLUMN IF NOT EXISTS "rize_entry_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rize_client_map" ADD CONSTRAINT "rize_client_map_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rize_time_entry" ADD CONSTRAINT "rize_time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rize_time_entry" ADD CONSTRAINT "rize_time_entry_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rize_time_entry" ADD CONSTRAINT "rize_time_entry_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rize_time_entry_started_idx" ON "rize_time_entry" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rize_time_entry_initiative_idx" ON "rize_time_entry" USING btree ("initiative_id","started_at");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_worklog" ADD CONSTRAINT "issue_worklog_rize_entry_id_rize_time_entry_id_fk" FOREIGN KEY ("rize_entry_id") REFERENCES "public"."rize_time_entry"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_worklog" ADD CONSTRAINT "issue_worklog_rize_entry_id_unique" UNIQUE("rize_entry_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_block" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"seconds" integer NOT NULL,
	"app" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"domain" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"issue_id" integer,
	"initiative_id" integer,
	"suggested_issue_id" integer,
	"suggested_initiative_id" integer,
	"confidence" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"rule_id" integer,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_block_user_id_source_key_unique" UNIQUE("user_id","source_key"),
	CONSTRAINT "time_block_source_check" CHECK ("time_block"."source" IN ('activity', 'call', 'manual')),
	CONSTRAINT "time_block_status_check" CHECK ("time_block"."status" IN ('pending', 'confirmed', 'ignored')),
	CONSTRAINT "time_block_seconds_check" CHECK ("time_block"."seconds" >= 0),
	CONSTRAINT "time_block_confidence_check" CHECK ("time_block"."confidence" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_device" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"agent_version" text,
	"tracker_ok" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_device_user_id_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_rule" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"field" text NOT NULL,
	"pattern" text NOT NULL,
	"issue_id" integer,
	"initiative_id" integer,
	"ignore" boolean DEFAULT false NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_rule_field_check" CHECK ("time_rule"."field" IN ('app', 'title', 'domain', 'contact'))
);
--> statement-breakpoint
ALTER TABLE "issue_worklog" ADD COLUMN IF NOT EXISTS "time_block_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_block" ADD CONSTRAINT "time_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_block" ADD CONSTRAINT "time_block_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_block" ADD CONSTRAINT "time_block_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_block" ADD CONSTRAINT "time_block_suggested_issue_id_issue_id_fk" FOREIGN KEY ("suggested_issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_block" ADD CONSTRAINT "time_block_suggested_initiative_id_initiative_id_fk" FOREIGN KEY ("suggested_initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_block" ADD CONSTRAINT "time_block_rule_id_time_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."time_rule"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_device" ADD CONSTRAINT "time_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_rule" ADD CONSTRAINT "time_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_rule" ADD CONSTRAINT "time_rule_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "time_rule" ADD CONSTRAINT "time_rule_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_block_user_started_idx" ON "time_block" USING btree ("user_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_rule_user_idx" ON "time_rule" USING btree ("user_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_worklog" ADD CONSTRAINT "issue_worklog_time_block_id_time_block_id_fk" FOREIGN KEY ("time_block_id") REFERENCES "public"."time_block"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_worklog" ADD CONSTRAINT "issue_worklog_time_block_id_unique" UNIQUE("time_block_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
