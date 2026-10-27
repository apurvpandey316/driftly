// Public API of the Driftly comparison engine.
// No Next.js imports anywhere in src/engine: it runs from the web app,
// the CLI (scripts/compare.ts), or a future background worker.

export * from "./types";
export { runScan, resolveScope, summarize, captureSnapshot } from "./run";
export { diffSnapshots } from "./diff";
export { testConnection, redact, VENDOR_SCHEMAS, type ConnectionTestResult } from "./connect";
export { toJSON, toCSV } from "./export";
export { compareRuns, coverageGap, scopeChanges, UNVERIFIED_LABEL, type RunData, type RunDiff, type RunComparison, type UnverifiedReason } from "./history";
