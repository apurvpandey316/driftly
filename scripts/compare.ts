/* Driftly CLI: compare two PostgreSQL databases from the terminal.
 *
 *   npm run compare -- <referenceUrl> <targetUrl> [options]
 *
 * Options:
 *   --schemas public,app      schemas to compare (default: public)
 *   --exclude users,public.x  tables to skip
 *   --ssl require             disable | require | verify-full
 *   --json out.json           also write the full result as JSON
 *   --csv out.csv             also write differences as CSV
 *
 * Exit codes: 0 in parity, 1 differences found, 2 scan failed or partial.
 */
import { writeFileSync } from "node:fs";
import { runScan, toCSV, toJSON, testConnection, type Difference, type ConnectionConfig } from "../src/engine";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));

const tty = process.stdout.isTTY;
const c = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = c(2), bold = c(1), yellow = c(33), cyan = c(36), magenta = c(35), red = c(31), green = c(32);

// Labels carry the meaning; colour is only a bonus.
const KIND = { missing: yellow("− MISSING "), extra: cyan("+ EXTRA   "), modified: magenta("~ MODIFIED") };
const SEV = { info: dim("info"), warning: yellow("warning"), breaking: red("BREAKING") };

async function main() {
  const [refUrl, tgtUrl] = positional;
  if (!refUrl || !tgtUrl) {
    console.error("Usage: npm run compare -- <referenceUrl> <targetUrl> [--schemas public] [--json out.json] [--csv out.csv]");
    process.exit(2);
  }
  const sslMode = flag("ssl") as ConnectionConfig["sslMode"];
  const schemas = (flag("schemas") ?? "public").split(",");
  const excludeTables = flag("exclude")?.split(",") ?? [];

  if (args.includes("--test")) {
    for (const [label, url] of [["reference", refUrl], ["target", tgtUrl]]) {
      console.log(label, await testConnection({ connectionString: url, sslMode }, schemas));
    }
    return;
  }

  const result = await runScan({
    reference: { connectionString: refUrl, sslMode },
    target: { connectionString: tgtUrl, sslMode },
    scope: { schemas, excludeTables },
  });

  const ref = result.reference?.database ?? "reference";
  const tgt = result.target?.database ?? "target";
  console.log(`\n${bold("Driftly")}  ${ref} ${dim("(reference)")} → ${tgt} ${dim("(target)")}`);
  console.log(dim(`Schemas: ${result.scope.schemas.join(", ")}   Status: `) + statusLabel(result.status) + "\n");

  for (const e of result.errors) console.log(red(`  ! ${e.side} ${e.stage}${e.scope ? ` [${e.scope}]` : ""}: ${e.message}`));
  for (const w of result.warnings) console.log(yellow(`  ⚠ ${w}`));
  if (result.errors.length || result.warnings.length) console.log();

  const byTable = new Map<string, Difference[]>();
  for (const d of result.differences) {
    const key = d.table ? `${d.schema}.${d.table}` : d.schema;
    byTable.set(key, [...(byTable.get(key) ?? []), d]);
  }
  for (const [table, diffs] of byTable) {
    console.log(bold(table));
    for (const d of diffs) {
      const name = d.path.slice(table.length + 1) || d.path;
      console.log(`  ${KIND[d.kind]}  ${d.objectKind.padEnd(11)} ${name.padEnd(24)} ${SEV[d.severity]}`);
      console.log(dim(`               ${d.note}`));
      for (const ch of d.changes) {
        console.log(`               ${dim(ch.field + ":")} expected ${fmt(ch.expected)}  ${dim("|")}  actual ${fmt(ch.actual)}`);
      }
    }
    console.log();
  }

  const s = result.summary;
  console.log(
    `${s.missing} missing · ${s.extra} extra · ${s.modified} modified   ` +
      dim(`(${s.bySeverity.breaking} breaking, ${s.bySeverity.warning} warning, ${s.bySeverity.info} info)`),
  );
  if (s.inParity) console.log(green("✓ In parity for the selected scope."));
  else if (result.status !== "completed") console.log(red("Scan was not complete, so parity cannot be confirmed."));

  const json = flag("json");
  const csv = flag("csv");
  if (json) writeFileSync(json, toJSON(result));
  if (csv) writeFileSync(csv, toCSV(result));

  process.exitCode = result.status !== "completed" ? 2 : s.inParity ? 0 : 1;
}

const fmt = (v: unknown) => (v == null ? "(none)" : typeof v === "string" ? v : JSON.stringify(v));
const statusLabel = (s: string) => (s === "completed" ? green(s) : s === "partial" ? yellow(s) : red(s));

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
