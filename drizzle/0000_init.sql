CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"key" text,
	"bytes" bigint,
	"error" text,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guest_links" (
	"slug" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"removed_at" timestamp with time zone,
	"guest_id" text,
	"guest_name" text,
	"caption" text,
	"original_caption" text,
	"file_name" text,
	"hash" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"taken_at" timestamp with time zone,
	"taken_at_source" text,
	"camera" text,
	"sort_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"first_shown_at" timestamp with time zone,
	"show_count" integer DEFAULT 0 NOT NULL,
	"files_deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "removals" (
	"id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"by" text NOT NULL,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"wall_id" text NOT NULL,
	"row" integer NOT NULL,
	"col" integer NOT NULL,
	"rows" integer NOT NULL,
	"cols" integer NOT NULL,
	"show_at" timestamp with time zone NOT NULL,
	"hold_seconds" real DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walls" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"cols" integer,
	"rows" integer,
	"show_qr" boolean DEFAULT true NOT NULL,
	"resync_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"status" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walls_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'moderator' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removals" ADD CONSTRAINT "removals_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_wall_id_walls_id_fk" FOREIGN KEY ("wall_id") REFERENCES "public"."walls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_status_idx" ON "photos" USING btree ("status","source");--> statement-breakpoint
CREATE INDEX "photos_guest_idx" ON "photos" USING btree ("guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "photos_roster_hash_idx" ON "photos" USING btree ("hash") WHERE "photos"."source" = 'roster';--> statement-breakpoint
CREATE INDEX "reservations_photo_idx" ON "reservations" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");