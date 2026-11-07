import { Card } from "@/components/ui/form";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-6 sm:py-10">
      <h1 className="text-center text-3xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-center text-muted">{subtitle}</p>}
      <Card className="mt-6">{children}</Card>
      {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
