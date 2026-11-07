import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "WebCenter Admin", template: "%s · WebCenter Admin" }, robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
