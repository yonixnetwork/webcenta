import { cn } from "@/components/ui/cn";

export function DataTable({ head, children, empty, className }: { head: string[]; children: React.ReactNode; empty?: boolean; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-border bg-surface", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wide text-subtle"><tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}

export const td = "px-3 py-2.5 align-top";

const STATUS_TONE: Record<string, string> = {
  PUBLISHED: "bg-success-soft text-success", APPROVED: "bg-success-soft text-success", VERIFIED: "bg-success-soft text-success", PASSED: "bg-success-soft text-success", ACTIVE: "bg-success-soft text-success", ACCEPTED: "bg-success-soft text-success", RESOLVED_ACTION_TAKEN: "bg-success-soft text-success", RESOLVED_NO_ACTION: "bg-surface-2 text-muted", OVERTURNED: "bg-success-soft text-success",
  UNDER_REVIEW: "bg-warning-soft text-warning", SUBMITTED: "bg-warning-soft text-warning", AUTOMATED_CHECKS: "bg-warning-soft text-warning", INFO_REQUIRED: "bg-warning-soft text-warning", PENDING: "bg-warning-soft text-warning", OPEN: "bg-warning-soft text-warning", IN_REVIEW: "bg-warning-soft text-warning", INVESTIGATING: "bg-warning-soft text-warning", WARNING: "bg-warning-soft text-warning", UNDER_INVESTIGATION: "bg-warning-soft text-warning", PENDING_REVIEW: "bg-warning-soft text-warning", HELD_FOR_MODERATION: "bg-warning-soft text-warning",
  REJECTED: "bg-danger-soft text-danger", SUSPENDED: "bg-danger-soft text-danger", REMOVED: "bg-danger-soft text-danger", FAILED: "bg-danger-soft text-danger", LAPSED: "bg-danger-soft text-danger", RESTRICTED: "bg-danger-soft text-danger", CRITICAL: "bg-danger-soft text-danger", HIGH: "bg-danger-soft text-danger", FAIL: "bg-danger-soft text-danger", DEAD: "bg-danger-soft text-danger",
  MEDIUM: "bg-warning-soft text-warning", WARN: "bg-warning-soft text-warning", PASS: "bg-success-soft text-success",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[status] ?? "bg-surface-2 text-muted")}>{status.replace(/_/g, " ").toLowerCase()}</span>;
}
