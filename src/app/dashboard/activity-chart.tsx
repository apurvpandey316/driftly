"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import type { ChartPoint } from "@/lib/overview";
import { cn } from "@/lib/utils";

const HEIGHT = 160;

function niceMax(n: number) {
  if (n <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / step) * step;
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" }) : "");

function statusText(p: ChartPoint) {
  if (p.status === "failed") return "Scan failed: no comparison made";
  if (p.status === "partial") return `Partial scan · ${p.total} difference${p.total === 1 ? "" : "s"} (may be incomplete)`;
  if (p.inParity) return "In parity";
  return `${p.total} difference${p.total === 1 ? "" : "s"}`;
}

/**
 * Differences found in the latest seven scans (one bar per scan, oldest → newest).
 * Failed scans have no bar and are marked with an icon and text, so a failure is
 * never mistaken for "0 differences".
 */
export function ActivityChart({ points }: { points: ChartPoint[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = niceMax(Math.max(0, ...points.map((p) => (p.status === "failed" ? 0 : p.total))));
  const ticks = [max, max / 2, 0];

  return (
    <figure className="m-0">
      <div className="flex gap-3">
        {/* y-axis */}
        <div className="relative w-6 shrink-0 text-right text-[11px] tabular-nums text-muted" style={{ height: HEIGHT }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: HEIGHT - (t / max) * HEIGHT }}>
              {Number.isInteger(t) ? t : ""}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {/* recessive grid */}
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border/60" style={{ top: HEIGHT - (t / max) * HEIGHT }} aria-hidden />
          ))}
          <ol className="relative flex items-end gap-2" style={{ height: HEIGHT }} aria-hidden>
            {points.map((p) => {
              const h = p.status === "failed" ? 0 : Math.max(0, (p.total / max) * HEIGHT);
              return (
                <li key={p.id} className="relative flex h-full flex-1 flex-col justify-end">
                  <Link
                    href={`/comparisons/${p.id}`}
                    tabIndex={-1}
                    onMouseEnter={() => setHover(p.id)}
                    onMouseLeave={() => setHover(null)}
                    className="group absolute inset-0 flex items-end justify-center"
                  >
                    {p.status === "failed" ? (
                      <span className="mb-1 inline-flex items-center gap-0.5 text-[11px] text-danger">
                        <X size={12} /> failed
                      </span>
                    ) : p.total === 0 ? (
                      <span className="mb-1 inline-flex items-center gap-0.5 text-[11px] text-ok">
                        <Check size={12} /> 0
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "w-full max-w-10 rounded-t bg-chart-bar transition-opacity group-hover:opacity-80",
                          p.status === "partial" && "bg-[repeating-linear-gradient(45deg,var(--chart-bar)_0_4px,transparent_4px_7px)]",
                        )}
                        style={{ height: h }}
                      />
                    )}
                  </Link>
                  {hover === p.id && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-60 -translate-x-1/2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg">
                      <div className="font-medium">{p.pair}</div>
                      <div className="text-muted">
                        {date(p.finishedAt)} {time(p.finishedAt)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        {p.status === "partial" && <AlertTriangle size={11} className="text-missing" />}
                        {statusText(p)}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {/* pad to seven slots so bar widths stay stable */}
            {Array.from({ length: Math.max(0, 7 - points.length) }).map((_, i) => (
              <li key={`pad-${i}`} className="flex-1" />
            ))}
          </ol>
          <ol className="mt-1.5 flex gap-2 text-center text-[11px] text-muted" aria-hidden>
            {points.map((p) => (
              <li key={p.id} className="flex-1 truncate tabular-nums">
                {time(p.finishedAt)}
              </li>
            ))}
            {Array.from({ length: Math.max(0, 7 - points.length) }).map((_, i) => (
              <li key={`pad-${i}`} className="flex-1" />
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-chart-bar" aria-hidden /> Differences found
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,var(--chart-bar)_0_2px,transparent_2px_4px)]" aria-hidden /> Partial scan
        </span>
        <span>Oldest → newest. Click a bar to open that scan.</span>
      </figcaption>

      {/* Accessible table view of the same data */}
      <table className="sr-only">
        <caption>Differences found in the latest scans</caption>
        <thead>
          <tr>
            <th>Scan</th>
            <th>Finished</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/comparisons/${p.id}`}>{p.pair}</Link>
              </td>
              <td>
                {date(p.finishedAt)} {time(p.finishedAt)}
              </td>
              <td>{statusText(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
