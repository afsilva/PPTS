import { z } from "zod";

const uuid = z.uuid();
const optionalUuid = z.preprocess(
  (value) => (value === "" ? null : value),
  uuid.nullable().optional(),
);
const optionalMinutes = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().min(0).max(10_000_000).optional(),
);
const optionalMoney = z
  .string()
  .trim()
  .regex(/^\d{1,7}(?:\.\d{1,2})?$/)
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? Math.round(Number(value) * 100) : null));

export const projectMembershipSchema = z.object({
  projectId: uuid,
  userId: uuid,
  role: z.enum(["CONTRIBUTOR", "MANAGER"]),
});

export const projectUpdateSchema = z.object({
  id: uuid,
  version: z.coerce.number().int().positive(),
  clientId: uuid,
  statusId: uuid,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  billingRate: optionalMoney,
  languages: z.string().trim().max(500).default(""),
  modules: z.string().trim().max(500).default(""),
  extras: z.string().trim().max(1000).default(""),
  developmentServerName: z.string().trim().max(255).default(""),
  developmentServerPath: z.string().trim().max(500).default(""),
  productionServerName: z.string().trim().max(255).default(""),
  productionServerPath: z.string().trim().max(500).default(""),
  estimatedDesignMinutes: optionalMinutes,
  estimatedCodingMinutes: optionalMinutes,
  estimatedManagementMinutes: optionalMinutes,
  estimatedTestingMinutes: optionalMinutes,
  estimatedMaintenanceMinutes: optionalMinutes,
  coderId: optionalUuid,
  developmentContactId: optionalUuid,
  productionContactId: optionalUuid,
});

export const projectMemberRemoveSchema = z.object({ projectId: uuid, userId: uuid });

export const projectLogSchema = z.object({
  projectId: uuid,
  body: z.string().trim().min(1).max(5000),
});
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ProjectLogInput = z.infer<typeof projectLogSchema>;
export type ProjectMembershipInput = z.infer<typeof projectMembershipSchema>;
export type ProjectMemberRemoveInput = z.infer<typeof projectMemberRemoveSchema>;
