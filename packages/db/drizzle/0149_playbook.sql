CREATE TABLE "playbook_item" (
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
CREATE TABLE "playbook_item_label" (
	"item_id" integer NOT NULL,
	"label_id" integer NOT NULL,
	CONSTRAINT "playbook_item_label_item_id_label_id_pk" PRIMARY KEY("item_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN "capacity_minutes" integer;--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN "revenue_class" text;--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN "monthly_fee_pence" integer;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "playbook_item_id" integer;--> statement-breakpoint
ALTER TABLE "playbook_item" ADD CONSTRAINT "playbook_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_item" ADD CONSTRAINT "playbook_item_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_item" ADD CONSTRAINT "playbook_item_type_id_issue_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."issue_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_item_label" ADD CONSTRAINT "playbook_item_label_item_id_playbook_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."playbook_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_item_label" ADD CONSTRAINT "playbook_item_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playbook_item_project_idx" ON "playbook_item" USING btree ("project_id","initiative_id","position");--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_playbook_item_id_playbook_item_id_fk" FOREIGN KEY ("playbook_item_id") REFERENCES "public"."playbook_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_playbook_item_idx" ON "issue" USING btree ("playbook_item_id","cycle_id") WHERE "issue"."playbook_item_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_revenue_class_check" CHECK ("initiative"."revenue_class" IN ('committed', 'new', 'management'));--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_monthly_fee_check" CHECK ("initiative"."monthly_fee_pence" >= 0);