#!/usr/bin/env node
const base = process.env.PPTS_TEST_URL ?? "http://127.0.0.1:3000";
const safari =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
const page = await fetch(base, { headers: { "User-Agent": safari, "Cache-Control": "no-cache" } });
if (!page.ok) throw new Error(`Page returned HTTP ${page.status}`);
const html = await page.text();
const paths = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
  (match) => match[1],
);
if (!paths.length) throw new Error("Page emitted no stylesheets.");
for (const path of paths) {
  const response = await fetch(new URL(path, base), {
    headers: { "User-Agent": safari, "Cache-Control": "no-cache" },
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.toLowerCase().startsWith("text/css"))
    throw new Error(`${path}: HTTP ${response.status}, Content-Type ${type || "missing"}`);
  const body = await response.text();
  if (!body.trim() || body.trimStart().startsWith("<"))
    throw new Error(`${path}: response is empty or HTML, not CSS`);
}
console.log(
  `Safari asset check passed: ${paths.length} stylesheet(s) returned HTTP 200 with text/css.`,
);
