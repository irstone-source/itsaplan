CREATE TABLE "finance_year" (
	"start_month" text PRIMARY KEY NOT NULL,
	"revenue_target_pence" integer NOT NULL,
	"project_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_year_format_check" CHECK ("finance_year"."start_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "finance_year_target_check" CHECK ("finance_year"."revenue_target_pence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "finance_year" ADD CONSTRAINT "finance_year_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;