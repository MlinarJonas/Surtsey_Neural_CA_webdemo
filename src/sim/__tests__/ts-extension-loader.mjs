// Minimal ESM resolve hook: if a relative specifier doesn't resolve as-is,
// retry with a .ts extension. Node's native TypeScript support requires an
// explicit extension, but this project's source (correctly, for Vite) omits
// them — this hook lets the parity test run the real source files unmodified.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !specifier.endsWith(".ts")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
