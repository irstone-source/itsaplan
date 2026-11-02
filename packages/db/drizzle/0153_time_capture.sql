CREATE TABLE "time_block" (
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
CREATE TABLE "time_device" (
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
CREATE TABLE "time_rule" (
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
ALTER TABLE "issue_worklog" ADD COLUMN "time_block_id" integer;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_suggested_issue_id_issue_id_fk" FOREIGN KEY ("suggested_issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_suggested_initiative_id_initiative_id_fk" FOREIGN KEY ("suggested_initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_rule_id_time_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."time_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_device" ADD CONSTRAINT "time_device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_rule" ADD CONSTRAINT "time_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_rule" ADD CONSTRAINT "time_rule_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_rule" ADD CONSTRAINT "time_rule_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_block_user_started_idx" ON "time_block" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "time_rule_user_idx" ON "time_rule" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "issue_worklog" ADD CONSTRAINT "issue_worklog_time_block_id_time_block_id_fk" FOREIGN KEY ("time_block_id") REFERENCES "public"."time_block"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_worklog" ADD CONSTRAINT "issue_worklog_time_block_id_unique" UNIQUE("time_block_id");