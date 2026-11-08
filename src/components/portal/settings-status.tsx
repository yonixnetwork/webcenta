import { cn } from "@/components/ui/cn";

const TONE = {
  connected: "bg-success-soft text-success",
  configured: "bg-brand-soft text-brand",
  missing: "bg-warning-soft text-warning",
  error: "bg-danger-soft text-danger",
  disabled: "bg-surface-2 text-muted",
} as const;
const LABEL = { connected: "Connected", configured: "Configured", missing: "Missing settings", error: "Error", disabled: "Disabled" } as const;

export function SettingsStatusPill({ status }: { status: keyof typeof TONE }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", TONE[status])}>{LABEL[status]}</span>;
}
