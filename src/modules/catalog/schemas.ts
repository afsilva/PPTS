import { z } from "zod";

const uuid = z.uuid();
const shortName = z.string().trim().min(1).max(120);
const description = z.string().trim().max(2000).default("");
const optionalMoney = z
  .string()
  .trim()
  .regex(/^\d{1,7}(?:\.\d{1,2})?$/)
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? Math.round(Number(value) * 100) : null));

export const clientCreateSchema = z.object({ name: shortName });
export const clientUpdateSchema = clientCreateSchema.extend({
  id: uuid,
  version: z.coerce.number().int().positive(),
});
export const statusCreateSchema = z.object({ name: shortName, description });
export const statusUpdateSchema = statusCreateSchema.extend({
  id: uuid,
  version: z.coerce.number().int().positive(),
});
export const workCodeCreateSchema = z.object({ name: shortName, description });
export const workCodeUpdateSchema = workCodeCreateSchema.extend({
  id: uuid,
  version: z.coerce.number().int().positive(),
});
export const projectCreateSchema = z.object({
  clientId: uuid,
  statusId: uuid,
  name: shortName,
  description,
  billingRate: optionalMoney,
});
export const archiveEntitySchema = z.object({
  entity: z.enum(["client", "project"]),
  id: uuid,
});
export const workCodeStateSchema = z.object({
  id: uuid,
  version: z.coerce.number().int().positive(),
  active: z.enum(["true", "false"]),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type StatusCreateInput = z.infer<typeof statusCreateSchema>;
export type StatusUpdateInput = z.infer<typeof statusUpdateSchema>;
export type WorkCodeCreateInput = z.infer<typeof workCodeCreateSchema>;
export type WorkCodeUpdateInput = z.infer<typeof workCodeUpdateSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ArchiveEntityInput = z.infer<typeof archiveEntitySchema>;
export type WorkCodeStateInput = z.infer<typeof workCodeStateSchema>;
