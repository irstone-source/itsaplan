CREATE TABLE "git_release" (
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
ALTER TABLE "git_release" ADD CONSTRAINT "git_release_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "git_release_project_idx" ON "git_release" USING btree ("project_id","published_at" DESC NULLS LAST);