# Comparison engine

Built in Part 1. Standalone TypeScript: no Next.js imports, so it can run from a
script, a background worker, or a future self-hosted scanner agent.

Planned layout:

- `types.ts` — normalized snapshot + difference types
- `inspect.ts` — read-only `pg_catalog` queries → normalized snapshot
- `normalize.ts` — make equivalent definitions compare equal
- `diff.ts` — reference vs target → Missing / Extra / Modified (+ severity)
- `run.ts` — orchestrates a scan, records partial / failed reads
