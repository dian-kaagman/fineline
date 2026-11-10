import { z } from "zod";
import type { Database } from "../../db/client.js";
import type { Clock } from "../../lib/clock.js";
import { parseOrThrow } from "../../lib/validation.js";
import { getLeadTimeWorkingDays, setLeadTimeWorkingDays } from "./settings.repository.js";

const LEAD_TIME_MESSAGE = "The lead time must be a whole number from 1 to 60";

const settingsBody = z.strictObject({
  leadTimeWorkingDays: z
    .number({ error: LEAD_TIME_MESSAGE })
    .int(LEAD_TIME_MESSAGE)
    .min(1, LEAD_TIME_MESSAGE)
    .max(60, LEAD_TIME_MESSAGE),
});

export interface SettingsServiceDeps {
  db: Database;
  clock: Clock;
  drawingArea: { widthMm: number; heightMm: number };
}

export function createSettingsService({ db, clock, drawingArea }: SettingsServiceDeps) {
  const view = (leadTimeWorkingDays: number) => ({
    leadTimeWorkingDays,
    drawingAreaWidthMm: drawingArea.widthMm,
    drawingAreaHeightMm: drawingArea.heightMm,
  });
  return {
    async get() {
      return view(await getLeadTimeWorkingDays(db));
    },
    /** Applies to orders placed afterwards only; existing orders keep their date (BR-008). */
    async update(body: unknown) {
      const { leadTimeWorkingDays } = parseOrThrow(settingsBody, body);
      await setLeadTimeWorkingDays(db, leadTimeWorkingDays, clock());
      return view(leadTimeWorkingDays);
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
