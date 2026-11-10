CREATE TYPE "public"."order_status" AS ENUM('received', 'drawing', 'drawn', 'ready_to_ship', 'shipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preview_token_hash" text NOT NULL,
	"photo_key" text NOT NULL,
	"photo_content_type" text NOT NULL,
	"svg_key" text NOT NULL,
	"width_mm" double precision NOT NULL,
	"height_mm" double precision NOT NULL,
	"stroke_count" integer NOT NULL,
	"total_length_mm" double precision NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"photo_deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "frames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"width_mm" integer NOT NULL,
	"height_mm" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"stock" integer NOT NULL,
	"photo_key" text NOT NULL,
	"photo_content_type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "frames_stock_non_negative" CHECK ("frames"."stock" >= 0),
	CONSTRAINT "frames_price_positive" CHECK ("frames"."price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_number_counters" (
	"year" smallint PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"drawing_id" uuid NOT NULL,
	"frame_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"street" text NOT NULL,
	"house_number" text NOT NULL,
	"postal_code" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"price_cents" integer NOT NULL,
	"order_date" date NOT NULL,
	"estimated_delivery_date" date NOT NULL,
	"status_changed_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_drawing_id_unique" UNIQUE("drawing_id"),
	CONSTRAINT "orders_delivery_after_order" CHECK ("orders"."estimated_delivery_date" >= "orders"."order_date")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY NOT NULL,
	"lead_time_working_days" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_lead_time_range" CHECK ("settings"."lead_time_working_days" BETWEEN 1 AND 60)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_frame_id_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."frames"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "drawings_expires_at_idx" ON "drawings" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_closed_at_idx" ON "orders" USING btree ("closed_at");