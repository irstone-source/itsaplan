ALTER TABLE "initiative" ADD COLUMN "monthly_minutes" integer;--> statement-breakpoint
ALTER TABLE "playbook_item" ADD COLUMN "measure" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_monthly_minutes_check" CHECK ("initiative"."monthly_minutes" >= 0);