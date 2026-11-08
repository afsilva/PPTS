import { z } from "zod";

const uuid = z.uuid();
const forbiddenNameCharacters = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

export const documentDeleteSchema = z.object({
  projectId: uuid,
  documentId: uuid,
  version: z.coerce.number().int().positive(),
});

export const documentUploadFieldsSchema = z.object({
  submissionId: uuid,
});

export function normalizeDocumentName(value: string) {
  const name = value.normalize("NFC");
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.length > 180 ||
    Buffer.byteLength(name, "utf8") > 255 ||
    name.includes("/") ||
    name.includes("\\") ||
    forbiddenNameCharacters.test(name)
  )
    throw new Error("invalid document name");
  return name;
}

export type DocumentDeleteInput = z.infer<typeof documentDeleteSchema>;
