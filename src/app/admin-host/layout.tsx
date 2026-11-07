import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Webcenta Admin", template: "%s · Webcenta Admin" }, robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
