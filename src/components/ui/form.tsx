import { cn } from "./cn";

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:opacity-60";

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-subtle">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function FormMessage({ tone = "danger", children }: { tone?: "danger" | "success" | "info"; children: React.ReactNode }) {
  const t = { danger: "bg-danger-soft text-danger", success: "bg-success-soft text-success", info: "bg-brand-soft text-brand" }[tone];
  return <p role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl px-3 py-2 text-sm", t)}>{children}</p>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6", className)}>{children}</div>;
}
