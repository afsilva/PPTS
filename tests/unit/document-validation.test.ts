import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDocumentName, documentDeleteSchema } from "../../src/modules/documents/schemas";
import { validateDocument } from "../../src/modules/documents/validation";
import { safeAttachmentHeader } from "../../src/modules/documents/headers";

const minimalPng = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from([0, 0, 0, 13]),
  Buffer.from("IHDR"),
  Buffer.alloc(17),
  Buffer.from("IEND"),
  Buffer.alloc(4),
]);

test("document names normalize while path, controls, bidi, and overlong values fail", () => {
  assert.equal(normalizeDocumentName("Résumé.pdf"), "Résumé.pdf");
  for (const value of [
    "",
    ".",
    "..",
    "../x.pdf",
    "x\\y.pdf",
    "x\r\ny.pdf",
    "x\u202ey.pdf",
    "x".repeat(181),
  ])
    assert.throws(() => normalizeDocumentName(value));
});

test("document formats require matching extension and complete signatures", () => {
  assert.equal(
    validateDocument(Buffer.from("plain UTF-8 ✓"), "notes.txt").mediaType,
    "text/plain; charset=utf-8",
  );
  assert.equal(
    validateDocument(Buffer.from("%PDF-1.7\nbody\n%%EOF\n"), "report.pdf").mediaType,
    "application/pdf",
  );
  assert.equal(validateDocument(minimalPng, "image.png").mediaType, "image/png");
  assert.equal(
    validateDocument(Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]), "photo.jpeg").mediaType,
    "image/jpeg",
  );
  assert.throws(() => validateDocument(Buffer.from("%PDF-1.7"), "report.pdf"));
  assert.throws(() => validateDocument(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "photo.png"));
  assert.throws(() => validateDocument(Buffer.from([0xff, 0xfe]), "notes.txt"));
  assert.throws(() => validateDocument(Buffer.from("binary\0text"), "notes.txt"));
});

test("download disposition is attachment-only and cannot inject headers", () => {
  const header = safeAttachmentHeader('résumé";x.pdf');
  assert.match(header, /^attachment;/);
  assert.ok(header.includes("filename*=UTF-8''"));
  assert.ok(!header.includes("\r"));
  assert.ok(!header.includes("\n"));
});

test("document delete requires immutable project/document IDs and a positive version", () => {
  assert.equal(
    documentDeleteSchema.safeParse({ projectId: "x", documentId: "y", version: "1" }).success,
    false,
  );
  assert.equal(
    documentDeleteSchema.safeParse({
      projectId: "00000000-0000-4000-8000-000000000001",
      documentId: "00000000-0000-4000-8000-000000000002",
      version: "1",
    }).success,
    true,
  );
});
