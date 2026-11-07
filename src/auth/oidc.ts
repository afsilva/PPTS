import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { getAuthConfig } from "./config";

const endpointUrl = z
  .url()
  .refine((value) => ["https:", "http:"].includes(new URL(value).protocol));
const discoverySchema = z.object({
  issuer: z.url(),
  authorization_endpoint: endpointUrl,
  token_endpoint: endpointUrl,
  jwks_uri: endpointUrl,
  end_session_endpoint: endpointUrl.optional(),
  response_types_supported: z.array(z.string()),
  subject_types_supported: z.array(z.string()),
  id_token_signing_alg_values_supported: z.array(z.string()),
  code_challenge_methods_supported: z.array(z.string()).optional(),
});
export type Discovery = z.infer<typeof discoverySchema>;
let cached: { value: Discovery; expires: number } | undefined;
const MAX_JSON_BYTES = 1024 * 1024;

function trustedEndpoint(value: string, trustedBase: string) {
  const endpoint = new URL(value);
  const base = new URL(trustedBase);
  if (endpoint.origin !== base.origin || endpoint.username || endpoint.password || endpoint.hash)
    throw new Error("Identity provider endpoint is not trusted.");
  return endpoint;
}

async function jsonResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json"))
    throw new Error("Identity provider returned an invalid content type.");
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_JSON_BYTES) throw new Error("Identity provider response is too large.");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES)
    throw new Error("Identity provider response is too large.");
  return JSON.parse(text) as unknown;
}

export async function discovery(): Promise<Discovery> {
  if (cached && cached.expires > Date.now()) return cached.value;
  const config = getAuthConfig();
  const discoveryUrl = new URL(".well-known/openid-configuration", `${config.internalIssuer}/`);
  trustedEndpoint(discoveryUrl.href, config.internalIssuer);
  const response = await fetch(discoveryUrl, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Identity provider discovery failed.");
  const raw = discoverySchema.parse(await jsonResponse(response));
  if (
    raw.issuer !== config.OIDC_ISSUER ||
    !raw.response_types_supported.includes("code") ||
    !raw.subject_types_supported.includes("public") ||
    !raw.id_token_signing_alg_values_supported.includes("RS256") ||
    !raw.code_challenge_methods_supported?.includes("S256")
  )
    throw new Error("Identity provider metadata is incompatible.");
  const publicIssuer = new URL(config.OIDC_ISSUER);
  const internalIssuer = new URL(config.internalIssuer);
  const publicEndpoint = (value: string) => trustedEndpoint(value, publicIssuer.href).href;
  const internalEndpoint = (value: string) => {
    const endpoint = trustedEndpoint(value, publicIssuer.href);
    return new URL(`${endpoint.pathname}${endpoint.search}`, `${internalIssuer.origin}/`).href;
  };
  const value = {
    ...raw,
    authorization_endpoint: publicEndpoint(raw.authorization_endpoint),
    token_endpoint: internalEndpoint(raw.token_endpoint),
    jwks_uri: internalEndpoint(raw.jwks_uri),
    ...(raw.end_session_endpoint
      ? { end_session_endpoint: publicEndpoint(raw.end_session_endpoint) }
      : {}),
  };
  cached = { value, expires: Date.now() + 5 * 60_000 };
  return value;
}

export async function exchangeCode(code: string, verifier: string) {
  const config = getAuthConfig();
  const meta = await discovery();
  const response = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.OIDC_CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: `${config.APP_ORIGIN}/auth/callback`,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Authorization code exchange failed.");
  const tokens = z
    .object({ id_token: z.string().min(1), token_type: z.string().optional() })
    .parse(await jsonResponse(response));
  if (tokens.token_type && tokens.token_type.toLowerCase() !== "bearer")
    throw new Error("Invalid token type.");
  return tokens;
}

export async function verifyIdToken(token: string, nonce: string) {
  const config = getAuthConfig();
  const meta = await discovery();
  const result = await jwtVerify(token, createRemoteJWKSet(new URL(meta.jwks_uri)), {
    issuer: config.OIDC_ISSUER,
    audience: config.OIDC_CLIENT_ID,
    algorithms: ["RS256"],
    clockTolerance: 5,
    maxTokenAge: "10m",
  });
  const claims = z
    .object({
      sub: z.string().min(1).max(255),
      nonce: z.string(),
      iat: z.number(),
      exp: z.number(),
      preferred_username: z.string().min(1).max(255).optional(),
      name: z.string().min(1).max(255).optional(),
      email: z.email().max(320).optional(),
      email_verified: z.boolean().optional(),
      realm_access: z.object({ roles: z.array(z.string()) }).optional(),
    })
    .parse(result.payload);
  if (claims.nonce !== nonce) throw new Error("Invalid identity token nonce.");
  return claims;
}
