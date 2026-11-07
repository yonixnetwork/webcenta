import Link from "next/link";
import "./globals.css";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold text-brand">404</p>
      <h1 className="text-3xl font-extrabold tracking-tight">Page not found</h1>
      <p className="text-muted">The page you are looking for doesn’t exist, or the listing is not available in your region.</p>
      <Link href="/" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast">Back to WebCenter</Link>
    </main>
  );
}
