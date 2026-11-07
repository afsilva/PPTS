import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { randomToken, safeEqual, seal, sha256, unseal, pkceChallenge } from "../../src/auth/crypto";
import { getAuthConfig } from "../../src/auth/config";

process.env.APP_ORIGIN = "http://localhost:3000";
process.env.OIDC_ISSUER = "http://localhost:8080/realms/ppts";
process.env.OIDC_CLIENT_ID = "ppts-local";
process.env.SESSION_SECRET = "unit-test-session-secret-0123456789abcdef0123456789abcdef";

test("randomToken produces 256-bit base64url values", () => {
  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(randomToken(), randomToken());
});

test("safeEqual is true for equal strings and false otherwise", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "ab"), false);
});

test("sha256 matches the Node reference implementation", () => {
  assert.equal(sha256("x"), createHash("sha256").update("x").digest("hex"));
});

test("pkceChallenge is the S256 digest of the verifier", () => {
  const verifier = randomToken(48);
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(pkceChallenge(verifier), expected);
});

test("seal/unseal round-trips a payload for its purpose", async () => {
  const payload = { v: 1, sid: randomToken(), exp: 123 };
  const token = await seal(payload, "ppts-session");
  assert.equal((await unseal<typeof payload>(token, "ppts-session")).sid, payload.sid);
});

test("unseal rejects a token sealed for another purpose", async () => {
  const token = await seal({ v: 1 }, "ppts-oidc-transaction");
  await assert.rejects(() => unseal(token, "ppts-session"), /purpose/i);
});

test("unseal rejects a tampered token", async () => {
  const token = await seal({ v: 1, sid: "s" }, "ppts-session");
  const tampered = token.slice(0, -4) + (token.endsWith("abcd") ? "AbCd" : "abcd");
  await assert.rejects(() => unseal(tampered, "ppts-session"));
});

test("auth config enforces loopback-only HTTP and secret length", () => {
  assert.equal(getAuthConfig().secureCookies, false);
  const previous = process.env.APP_ORIGIN;
  try {
    process.env.APP_ORIGIN = "http://10.0.0.5:3000";
    assert.throws(() => getAuthConfig(), /loopback/i);
    process.env.APP_ORIGIN = "https://ppts.example";
    assert.equal(getAuthConfig().secureCookies, true);
  } finally {
    process.env.APP_ORIGIN = previous;
  }
  const secret = process.env.SESSION_SECRET;
  try {
    process.env.SESSION_SECRET = "short";
    assert.throws(() => getAuthConfig());
  } finally {
    process.env.SESSION_SECRET = secret;
  }
});
