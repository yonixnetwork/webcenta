import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminAuthShell } from "@/components/portal/admin-auth-shell";
import { SetupForm } from "@/components/setup/setup-forms";
import { createOwnerInviteAction, prepareDatabaseAction } from "@/server/actions/setup";
import { setupOpen, setupState } from "@/server/setup/setup";
import { startupStatus } from "@/server/settings/startup";

export const metadata = { title: "First-time setup", robots: { index: false, follow: false } };

/**
 * First-time setup. 404 unless SETUP_TOKEN is set AND there is no active Super
 * Administrator, so it disappears as soon as the owner account exists.
 */
export default async function SetupPage() {
  await connection();
  if (!(await setupOpen())) notFound();
  const s = await setupState();
  const env = startupStatus().filter((v) => v.required !== "optional");
  const dbReady = s.database.ok && s.migrations.pending.length === 0 && s.migrations.failed.length === 0 && (s.baseData.categories ?? 0) > 0;
  return (
    <AdminAuthShell title="First-time setup" subtitle="Prepare the database and create the owner (Super Administrator) account. This page disappears once the owner account exists.">
      <div className="space-y-5 text-sm">
        <Step n={1} title="Hosting environment" done={env.every((v) => v.set || (v.required === "production" && process.env.NODE_ENV !== "production"))}>
          <ul className="space-y-1">{env.map((v) => <li key={v.name}><code>{v.name}</code> — {v.set ? <span className="text-success">set</span> : <span className="text-danger">missing</span>}</li>)}</ul>
          <p className="text-xs text-subtle">Set these in hPanel → Websites → Node.js → Environment variables, then restart the app.</p>
        </Step>
        <Step n={2} title="Database" done={dbReady}>
          {!s.database.ok ? (
            <p role="alert" className="text-danger">Cannot connect to the database: {s.database.error}. Check DATABASE_URL (host 127.0.0.1 on Hostinger).</p>
          ) : (
            <>
              <p>{s.migrations.total} migration(s); {s.migrations.pending.length} pending{s.migrations.failed.length ? <span className="text-danger">, {s.migrations.failed.length} failed or modified ({s.migrations.failed.join(", ")})</span> : ""}. Categories: {s.baseData.categories ?? "no tables yet"}.</p>
              {!s.migrations.dirFound && <p className="text-danger">The migrations folder is missing from this deployment.</p>}
              {!dbReady && <SetupForm action={prepareDatabaseAction} submitLabel="Create tables and base data" />}
            </>
          )}
        </Step>
        <Step n={3} title="Owner account" done={false}>
          {dbReady ? (
            <>
              {s.pendingInvitation && <p className="text-subtle">An owner invitation is already waiting. Creating a new one for the same email replaces it.</p>}
              <SetupForm action={createOwnerInviteAction} submitLabel="Create owner invitation" withEmail />
            </>
          ) : <p className="text-subtle">Available after the database is ready.</p>}
        </Step>
        <Step n={4} title="Then" done={false}>
          <p>Accept the invitation (password + authenticator app), sign in, and open <strong>Settings</strong> to configure email, sign-in providers, storage and the other integrations. Finally remove <code>SETUP_TOKEN</code> from the environment.</p>
        </Step>
      </div>
    </AdminAuthShell>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children?: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border pt-4 first:border-0 first:pt-0">
      <h2 className="font-semibold">{done ? "✓" : `${n}.`} {title}</h2>
      {children}
    </section>
  );
}
