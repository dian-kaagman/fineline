import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ORDER_STATUSES } from "../domain/order-status.js";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** A drawing made from an uploaded photo; a preview until an order references it (glossary). */
export const drawings = pgTable(
  "drawings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    previewTokenHash: text("preview_token_hash").notNull(),
    photoKey: text("photo_key").notNull(),
    photoContentType: text("photo_content_type").notNull(),
    svgKey: text("svg_key").notNull(),
    widthMm: doublePrecision("width_mm").notNull(),
    heightMm: doublePrecision("height_mm").notNull(),
    strokeCount: integer("stroke_count").notNull(),
    totalLengthMm: doublePrecision("total_length_mm").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    photoDeletedAt: timestamptz("photo_deleted_at"),
  },
  (t) => [index("drawings_expires_at_idx").on(t.expiresAt)],
);

export const frames = pgTable(
  "frames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    widthMm: integer("width_mm").notNull(),
    heightMm: integer("height_mm").notNull(),
    priceCents: integer("price_cents").notNull(),
    stock: integer("stock").notNull(),
    photoKey: text("photo_key").notNull(),
    photoContentType: text("photo_content_type").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (t) => [
    check("frames_stock_non_negative", sql`${t.stock} >= 0`),
    check("frames_price_positive", sql`${t.priceCents} > 0`),
  ],
);

export const orderStatus = pgEnum("order_status", ORDER_STATUSES);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    drawingId: uuid("drawing_id")
      .notNull()
      .unique()
      .references(() => drawings.id),
    frameId: uuid("frame_id")
      .notNull()
      .references(() => frames.id),
    status: orderStatus("status").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    street: text("street").notNull(),
    houseNumber: text("house_number").notNull(),
    postalCode: text("postal_code").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    priceCents: integer("price_cents").notNull(),
    orderDate: date("order_date", { mode: "string" }).notNull(),
    estimatedDeliveryDate: date("estimated_delivery_date", { mode: "string" }).notNull(),
    statusChangedAt: timestamptz("status_changed_at").notNull(),
    closedAt: timestamptz("closed_at"),
    createdAt: timestamptz("created_at").notNull(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_closed_at_idx").on(t.closedAt),
    check("orders_delivery_after_order", sql`${t.estimatedDeliveryDate} >= ${t.orderDate}`),
  ],
);

/** One row per Amsterdam year; `last_value` is the last order number sequence used (BR-007). */
export const orderNumberCounters = pgTable("order_number_counters", {
  year: smallint("year").primaryKey(),
  lastValue: integer("last_value").notNull(),
});

/** Single row (id = 1). */
export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey(),
    leadTimeWorkingDays: integer("lead_time_working_days").notNull().default(7),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("settings_single_row", sql`${t.id} = 1`),
    check("settings_lead_time_range", sql`${t.leadTimeWorkingDays} BETWEEN 1 AND 60`),
  ],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    idHash: text("id_hash").primaryKey(),
    createdAt: timestamptz("created_at").notNull(),
    lastSeenAt: timestamptz("last_seen_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (t) => [index("admin_sessions_expires_at_idx").on(t.expiresAt)],
);
