ALTER TABLE "initiative" DROP CONSTRAINT "initiative_billing_model_check";--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN "target_pence" integer;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "value_override_pence" integer;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_billing_model_check" CHECK ("initiative"."billing_model" IN ('day_rate', 'retainer', 'rev_share', 'internal'));