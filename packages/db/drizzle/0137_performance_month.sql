CREATE TABLE "performance_month" (
	"month" text PRIMARY KEY NOT NULL,
	"break_even_pence" integer NOT NULL,
	"pool_percent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_month_format_check" CHECK ("performance_month"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "performance_month_break_even_check" CHECK ("performance_month"."break_even_pence" >= 0),
	CONSTRAINT "performance_month_pool_check" CHECK ("performance_month"."pool_percent" BETWEEN 0 AND 100)
);
