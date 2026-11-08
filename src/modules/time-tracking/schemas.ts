import { z } from "zod";
import { cleanMessage } from "./domain";

const uuid = z.uuid();
const message = z.preprocess(cleanMessage, z.string().max(280));

export const clockInSchema = z.object({
  projectId: uuid,
  workCodeId: uuid,
  message: message.default(""),
});

export const switchSchema = clockInSchema;

export const presenceSchema = z.object({
  state: z.enum(["AVAILABLE", "OFF_DUTY"]),
  message: message.default(""),
});

export const timeCorrectionSchema = z.object({
  id: uuid,
  version: z.coerce.number().int().positive(),
  startedAt: z.string().trim().max(16),
  endedAt: z.string().trim().max(16),
  note: z.string().trim().max(2000).default(""),
});

export type ClockSelection = z.infer<typeof clockInSchema>;
export type TimeCorrectionInput = z.infer<typeof timeCorrectionSchema>;
