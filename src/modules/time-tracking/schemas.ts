import { z } from "zod";
import { cleanMessage } from "./domain";

const uuid = z.uuid();
const message = z.preprocess(cleanMessage, z.string().max(280));

const submission = { submissionId: uuid };

export const clockInSchema = z.object({
  ...submission,
  projectId: uuid,
  workCodeId: uuid,
  message: message.default(""),
});

export const switchSchema = clockInSchema;

export const clockOutSchema = z.object(submission);

export const presenceSchema = z.object({
  ...submission,
  state: z.enum(["AVAILABLE", "OFF_DUTY"]),
  message: message.default(""),
});

const utcTimestamp = z
  .string()
  .trim()
  .min(19)
  .max(23)
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/);

export const timeCorrectionSchema = z.object({
  id: uuid,
  version: z.coerce.number().int().positive(),
  startedAt: utcTimestamp,
  endedAt: utcTimestamp,
  note: z.string().trim().max(1000).default(""),
});

export type ClockSelection = z.infer<typeof clockInSchema>;
export type ClockOutInput = z.infer<typeof clockOutSchema>;
export type PresenceInput = z.infer<typeof presenceSchema>;
export type TimeCorrectionInput = z.infer<typeof timeCorrectionSchema>;
