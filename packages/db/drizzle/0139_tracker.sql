CREATE TABLE "tracker_entry" (
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
CREATE TABLE "tracker_measure" (
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
CREATE TABLE "tracker_target_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"measure_id" integer NOT NULL,
	"effective_from" date NOT NULL,
	"rule" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"changed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracker_entry" ADD CONSTRAINT "tracker_entry_measure_id_tracker_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."tracker_measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_entry" ADD CONSTRAINT "tracker_entry_entered_by_user_id_user_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_measure" ADD CONSTRAINT "tracker_measure_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_measure" ADD CONSTRAINT "tracker_measure_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_measure" ADD CONSTRAINT "tracker_measure_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_target_version" ADD CONSTRAINT "tracker_target_version_measure_id_tracker_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."tracker_measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_target_version" ADD CONSTRAINT "tracker_target_version_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_entry_period_idx" ON "tracker_entry" USING btree ("measure_id","period_start");--> statement-breakpoint
CREATE INDEX "tracker_measure_project_idx" ON "tracker_measure" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tracker_target_version_measure_idx" ON "tracker_target_version" USING btree ("measure_id","effective_from");