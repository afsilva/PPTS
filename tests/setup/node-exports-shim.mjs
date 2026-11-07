// Node test-runner shim. The Next.js package exposes no `exports` map, and
// source modules use bundler-style extensionless relative imports, so bare
// Node cannot resolve them outside the Next compiler. This hook retries
// failed resolutions with `.ts`/`.js` extensions. Load via `node --import`.
import { registerHooks } from "node:module";

function retries(specifier) {
  if (specifier.startsWith("next/") && !specifier.split("/").pop()?.includes("."))
    return [`${specifier}.js`];
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !specifier.split("/").pop()?.includes(".")
  )
    return [`${specifier}.ts`, `${specifier}.js`];
  return [];
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      for (const candidate of retries(specifier)) {
        try {
          return nextResolve(candidate, context);
        } catch {
          // try the next candidate
        }
      }
      throw error;
    }
  },
});
