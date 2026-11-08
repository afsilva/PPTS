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
  state: z.literal("AVAILABLE"),
  message: message.default(""),
});

export type ClockSelection = z.infer<typeof clockInSchema>;
