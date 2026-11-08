import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// HSTS is only emitted when the build is configured for HTTPS. The local
// development container deliberately runs loopback HTTP, so an unconditional
// HSTS header would be noise there. Set APP_ORIGIN (https) at build time for
// production deployments.
try {
  if (process.env.APP_ORIGIN && new URL(process.env.APP_ORIGIN).protocol === "https:")
    securityHeaders.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
} catch {
  // Unparseable APP_ORIGIN is rejected later by the auth configuration guard.
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
