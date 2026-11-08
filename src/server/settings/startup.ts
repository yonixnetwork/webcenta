/**
 * Variables that must exist in the hosting environment before the application
 * starts (everything else is configured in Admin → Settings). Only presence is
 * ever reported, never values.
 */
export const STARTUP_VARS: Array<{ name: string; required: "always" | "production" | "optional"; purpose: string }> = [
  { name: "DATABASE_URL", required: "always", purpose: "MySQL / MariaDB connection (mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE). Needed before any setting can be read." },
  { name: "FIELD_ENCRYPTION_KEY", required: "production", purpose: "32 random bytes (base64). Encrypts saved credentials and admin two-factor secrets, and derives the session secret. Keep a copy: losing it makes saved secrets unreadable." },
  { name: "PUBLIC_ORIGIN", required: "production", purpose: "The public address, e.g. https://webcenta.com. The admin and developer addresses default to admin. and developers. subdomains of it." },
  { name: "NODE_ENV", required: "production", purpose: "\"production\" on the live server." },
  { name: "USER_AUTH_SECRET", required: "optional", purpose: "Session-signing secret for user accounts. Derived from FIELD_ENCRYPTION_KEY when not set." },
  { name: "ADMIN_ORIGIN", required: "optional", purpose: "Only if the admin portal is not at admin.<public host>." },
  { name: "DEVELOPER_ORIGIN", required: "optional", purpose: "Only if the developer address is not developers.<public host>." },
  { name: "DATABASE_POOL_MAX", required: "optional", purpose: "Database connections per process (default 5)." },
  { name: "SETUP_TOKEN", required: "optional", purpose: "Only for first-time setup (creating the first Super Administrator). Remove it afterwards." },
  { name: "MAINTENANCE_MODE", required: "optional", purpose: "\"true\" serves a maintenance page to visitors (the admin portal keeps working)." },
];

export function startupStatus(env: NodeJS.ProcessEnv = process.env) {
  return STARTUP_VARS.map((v) => ({ ...v, set: Boolean(env[v.name]) }));
}
