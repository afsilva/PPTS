import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_ORIGIN: z.url(),
  OIDC_ISSUER: z.url(),
  OIDC_INTERNAL_ISSUER: z.url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).max(100),
  SESSION_SECRET: z.string().min(43),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export function getAuthConfig() {
  const config = schema.parse({
    APP_ORIGIN: process.env.APP_ORIGIN,
    OIDC_ISSUER: process.env.OIDC_ISSUER,
    OIDC_INTERNAL_ISSUER: process.env.OIDC_INTERNAL_ISSUER,
    OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
    SESSION_SECRET: process.env.SESSION_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  });
  const origin = new URL(config.APP_ORIGIN);
  const insecureLoopback =
    origin.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !insecureLoopback)
    throw new Error("Insecure authentication is allowed only on loopback.");
  return {
    ...config,
    secureCookies: origin.protocol === "https:",
    internalIssuer: config.OIDC_INTERNAL_ISSUER ?? config.OIDC_ISSUER,
  };
}
