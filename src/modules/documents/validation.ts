import { extname } from "node:path";

export type ValidatedDocument = Readonly<{ mediaType: string; extension: string }>;

function isUtf8Text(bytes: Buffer) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function validPdf(bytes: Buffer) {
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return false;
  const tail = bytes.subarray(Math.max(0, bytes.length - 1024)).toString("latin1");
  return /%%EOF\s*$/.test(tail);
}

function validPng(bytes: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return (
    bytes.length >= 41 &&
    bytes.subarray(0, 8).equals(signature) &&
    bytes.subarray(12, 16).toString("ascii") === "IHDR" &&
    bytes.subarray(bytes.length - 8, bytes.length - 4).toString("ascii") === "IEND"
  );
}

function validJpeg(bytes: Buffer) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

/**
 * Deliberately narrow format policy. Browser MIME is ignored; extension and
 * complete-file signatures must agree before bytes may enter quarantine.
 */
export function validateDocument(bytes: Buffer, originalName: string): ValidatedDocument {
  const extension = extname(originalName).toLowerCase();
  if (extension === ".pdf" && validPdf(bytes)) return { mediaType: "application/pdf", extension };
  if (extension === ".png" && validPng(bytes)) return { mediaType: "image/png", extension };
  if ((extension === ".jpg" || extension === ".jpeg") && validJpeg(bytes))
    return { mediaType: "image/jpeg", extension };
  if (extension === ".txt" && isUtf8Text(bytes))
    return { mediaType: "text/plain; charset=utf-8", extension };
  throw new Error("unsupported document");
}
