import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import { db } from "@/server/db";

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
 * EMAIL_TRANSPORT=log records messages without sending (development, tests, staging).
 */
export async function sendEmail(input: EmailInput): Promise<{ id: string; delivered: boolean }> {
  const msg = await db.emailMessage.create({ data: { ...input, to: input.to.toLowerCase() } });
  const delivered = await deliver(msg.id).catch(() => false);
  return { id: msg.id, delivered };
}

let transporter: Transporter | null = null;
function smtp() {
  const e = env();
  if (!e.SMTP_HOST) throw new Error("SMTP_HOST is not configured");
  transporter ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE ? e.SMTP_SECURE === "true" : e.SMTP_PORT === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export async function deliver(id: string): Promise<boolean> {
  const e = env();
  const msg = await db.emailMessage.findUnique({ where: { id } });
  if (!msg || msg.status === "SENT" || msg.status === "LOGGED") return true;
  if (e.EMAIL_TRANSPORT === "log") {
    await db.emailMessage.update({ where: { id }, data: { status: "LOGGED", sentAt: new Date(), attempts: { increment: 1 } } });
    return true;
  }
  try {
    await smtp().sendMail({ from: e.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html ?? undefined });
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
