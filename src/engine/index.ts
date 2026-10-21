// Public API of the Driftly comparison engine.
// No Next.js imports anywhere in src/engine: it runs from the web app,
// the CLI (scripts/compare.ts), or a future background worker.

export * from "./types";
export { runScan, resolveScope, summarize } from "./run";
export { diffSnapshots } from "./diff";
export { testConnection, redact, VENDOR_SCHEMAS } from "./connect";
export { toJSON, toCSV } from "./export";
