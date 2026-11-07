import Link from "next/link";
import { AdminAuthShell } from "@/components/portal/admin-auth-shell";

export default function Forbidden() {
  return <AdminAuthShell title="Access denied"><p className="text-sm text-muted">Your role does not include this area. The attempt was recorded.</p><Link href="/" className="mt-4 inline-block text-sm font-semibold text-brand">Back to dashboard</Link></AdminAuthShell>;
}
