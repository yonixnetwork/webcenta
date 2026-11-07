import { Logo } from "@/components/logo";

export function AdminAuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center"><div className="inline-block"><Logo /></div><p className="mt-1 text-xs font-semibold uppercase tracking-widest text-subtle">Administration</p></div>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      <p className="text-center text-xs text-subtle">Authorised personnel only. All activity is logged.</p>
    </main>
  );
}
