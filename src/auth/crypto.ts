import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CompactEncrypt, compactDecrypt } from "jose";
import { getAuthConfig } from "./config";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function key() {
  return createHash("sha256").update(getAuthConfig().SESSION_SECRET, "utf8").digest();
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function seal(payload: object, purpose: string) {
  return new CompactEncrypt(encoder.encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: purpose })
    .encrypt(key());
}

export async function unseal<T>(token: string, purpose: string): Promise<T> {
  const { plaintext, protectedHeader } = await compactDecrypt(token, key(), {
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  if (protectedHeader.typ !== purpose) throw new Error("Invalid token purpose.");
  return JSON.parse(decoder.decode(plaintext)) as T;
}
