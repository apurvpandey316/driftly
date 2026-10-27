import { AlertTriangle, CheckCircle2, CircleDot, XCircle } from "lucide-react";
import type { ScanStatus, ScanSummary } from "@/engine/types";
import { cn } from "@/lib/utils";

/**
 * Overall health of a scan. Icon + text, never colour alone.
 * Only a completed scan with zero differences is "In parity".
 */
export function ScanStatusPill({ status, summary, className }: { status: ScanStatus; summary: ScanSummary; className?: string }) {
  const total = summary.missing + summary.extra + summary.modified;
  const base = "inline-flex items-center gap-1.5 text-xs font-medium";
  if (status === "failed")
    return (
      <span className={cn(base, "text-danger", className)}>
        <XCircle size={14} aria-hidden /> Scan failed
      </span>
    );
  if (status === "partial")
    return (
      <span className={cn(base, "text-missing", className)}>
        <AlertTriangle size={14} aria-hidden /> Partial scan{total ? ` · ${total} difference${total === 1 ? "" : "s"}` : ""}
      </span>
    );
  if (summary.inParity)
    return (
      <span className={cn(base, "text-ok", className)}>
        <CheckCircle2 size={14} aria-hidden /> In parity
      </span>
    );
  return (
    <span className={cn(base, "text-modified", className)}>
      <CircleDot size={14} aria-hidden /> {total} difference{total === 1 ? "" : "s"}
      {summary.bySeverity.breaking > 0 && <span className="text-danger">· {summary.bySeverity.breaking} potentially breaking</span>}
    </span>
  );
}
