ALTER TABLE "drawings" ADD COLUMN "svg_deleted_at" timestamp with time zone;--> statement-breakpoint
-- Frame snapshot on the order (Q-41): added nullable, backfilled from the current frame, then required.
ALTER TABLE "orders" ADD COLUMN "frame_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "frame_width_mm" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "frame_height_mm" integer;--> statement-breakpoint
UPDATE "orders" SET "frame_name" = "frames"."name", "frame_width_mm" = "frames"."width_mm", "frame_height_mm" = "frames"."height_mm" FROM "frames" WHERE "frames"."id" = "orders"."frame_id";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "frame_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "frame_width_mm" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "frame_height_mm" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "erased_at" timestamp with time zone;
