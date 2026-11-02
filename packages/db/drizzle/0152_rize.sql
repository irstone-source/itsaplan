CREATE TABLE "rize_client_map" (
	"rize_client" text PRIMARY KEY NOT NULL,
	"initiative_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rize_time_entry" (
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
ALTER TABLE "issue_worklog" ADD COLUMN "rize_entry_id" integer;--> statement-breakpoint
ALTER TABLE "rize_client_map" ADD CONSTRAINT "rize_client_map_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rize_time_entry" ADD CONSTRAINT "rize_time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rize_time_entry" ADD CONSTRAINT "rize_time_entry_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rize_time_entry" ADD CONSTRAINT "rize_time_entry_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rize_time_entry_started_idx" ON "rize_time_entry" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "rize_time_entry_initiative_idx" ON "rize_time_entry" USING btree ("initiative_id","started_at");--> statement-breakpoint
ALTER TABLE "issue_worklog" ADD CONSTRAINT "issue_worklog_rize_entry_id_rize_time_entry_id_fk" FOREIGN KEY ("rize_entry_id") REFERENCES "public"."rize_time_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_worklog" ADD CONSTRAINT "issue_worklog_rize_entry_id_unique" UNIQUE("rize_entry_id");