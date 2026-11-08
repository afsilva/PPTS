import { z } from "zod";

const uuid = z.uuid();
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalInt = (min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional());

const personFields = z.object({
  kind: z.enum(["EMPLOYEE", "CONTACT"]),
  displayName: z.string().trim().min(1).max(160),
  title: z.string().trim().max(120).default(""),
  address: z.string().trim().max(500).default(""),
  workPhone: z.string().trim().max(40).default(""),
  homePhone: z.string().trim().max(40).default(""),
  mobilePhone: z.string().trim().max(40).default(""),
  legacyIm: z.string().trim().max(80).default(""),
  birthdayMonth: optionalInt(1, 12),
  birthdayDay: optionalInt(1, 31),
});

function validBirthday(value: z.infer<typeof personFields>, context: z.RefinementCtx) {
  if ((value.birthdayMonth === undefined) !== (value.birthdayDay === undefined))
    context.addIssue({
      code: "custom",
      message: "Birthday month and day must be provided together.",
    });
  if (value.birthdayMonth && value.birthdayDay) {
    const date = new Date(Date.UTC(2000, value.birthdayMonth - 1, value.birthdayDay));
    if (date.getUTCMonth() !== value.birthdayMonth - 1 || date.getUTCDate() !== value.birthdayDay)
      context.addIssue({ code: "custom", message: "Birthday is not a valid calendar date." });
  }
}

export const personCreateSchema = personFields
  .extend({ submissionId: uuid })
  .superRefine(validBirthday);
export const personUpdateSchema = personFields
  .extend({ id: uuid, version: z.coerce.number().int().positive() })
  .superRefine(validBirthday);
export const personArchiveSchema = z.object({
  id: uuid,
  version: z.coerce.number().int().positive(),
});
export const personLinkSchema = z.object({
  id: uuid,
  userId: uuid,
  version: z.coerce.number().int().positive(),
});
export const personUnlinkSchema = z.object({
  id: uuid,
  version: z.coerce.number().int().positive(),
});

export type PersonCreateInput = z.infer<typeof personCreateSchema>;
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;
export type PersonArchiveInput = z.infer<typeof personArchiveSchema>;
export type PersonLinkInput = z.infer<typeof personLinkSchema>;
export type PersonUnlinkInput = z.infer<typeof personUnlinkSchema>;
