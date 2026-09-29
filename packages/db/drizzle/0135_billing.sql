ALTER TABLE "initiative" ADD COLUMN "billing_model" text;--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN "day_rate_pence" integer;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_billing_model_check" CHECK ("initiative"."billing_model" IN ('day_rate', 'retainer', 'rev_share'));--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_day_rate_check" CHECK ("initiative"."day_rate_pence" >= 0);