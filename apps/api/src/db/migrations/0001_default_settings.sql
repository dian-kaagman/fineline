-- The single settings row with the default standard lead time of 7 working days (BR-008).
INSERT INTO "settings" ("id", "lead_time_working_days") VALUES (1, 7) ON CONFLICT ("id") DO NOTHING;
