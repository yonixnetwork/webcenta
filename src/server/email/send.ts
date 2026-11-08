import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/server/db";
import { getSection, type Section } from "@/server/settings/store";

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  template: string;
}

/**
 * Queues an email in the EmailMessage outbox and tries to deliver it immediately.
 * Undelivered messages are retried by the "email.deliver" job (cron).
 * SMTP is configured in Admin → Settings → Email (or SMTP_* / EMAIL_TRANSPORT=smtp
 * environment variables). While it is disabled or incomplete, messages are
 * recorded as LOGGED without being sent (development, tests, staging).
 */
export async function sendEmail(input: EmailInput): Promise<{ id: string; delivered: boolean }> {
  const msg = await db.emailMessage.create({ data: { ...input, to: input.to.toLowerCase() } });
  const delivered = await deliver(msg.id).catch(() => false);
  return { id: msg.id, delivered };
}

export interface SmtpConfig { host: string; port: number; secure: boolean; user: string; password: string; from: string }

export function smtpConfig(c: Section): SmtpConfig {
  const port = c.num("port") || 465;
  // Without an explicit choice, SSL from the start on 465 and STARTTLS otherwise.
  const secure = c.source("secure") === "default" ? port === 465 : c.bool("secure");
  return { host: c.str("host"), port, secure, user: c.str("user"), password: c.str("password"), from: c.str("from") };
}

export function createSmtpTransport(s: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.password } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  });
}

/** One transport per distinct SMTP configuration; replaced when an admin changes it. */
const g = globalThis as unknown as { __webcentaSmtp?: { key: string; t: Transporter } };
function transportFor(s: SmtpConfig): Transporter {
  const key = JSON.stringify(s);
  if (g.__webcentaSmtp?.key !== key) {
    g.__webcentaSmtp?.t.close();
    g.__webcentaSmtp = { key, t: createSmtpTransport(s) };
  }
  return g.__webcentaSmtp.t;
}

export async function deliver(id: string): Promise<boolean> {
  const msg = await db.emailMessage.findUnique({ where: { id } });
  if (!msg || msg.status === "SENT" || msg.status === "LOGGED") return true;
  const c = await getSection("email");
  if (!c.ready) {
    await db.emailMessage.update({ where: { id }, data: { status: "LOGGED", sentAt: new Date(), attempts: { increment: 1 } } });
    return true;
  }
  const s = smtpConfig(c);
  try {
    await transportFor(s).sendMail({ from: s.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html ?? undefined });
    await db.emailMessage.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
    return true;
  } catch (err) {
    const attempts = msg.attempts + 1;
    await db.emailMessage.update({
      where: { id },
      data: { status: attempts >= 6 ? "FAILED" : "PENDING", attempts, lastError: String(err instanceof Error ? err.message : err).slice(0, 500) },
    });
    return false;
  }
}

export async function deliverPending(limit = 25): Promise<number> {
  const pending = await db.emailMessage.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  let ok = 0;
  for (const m of pending) if (await deliver(m.id)) ok++;
  return ok;
}
