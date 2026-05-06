import nodemailer from "nodemailer";
import { logger } from "./logger";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  if (transporter) return transporter;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.EMAIL_FROM ?? smtpUser ?? "noreply@harmonia.app";

  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  (transporter as { _fromEmail?: string })._fromEmail = fromEmail;
  return transporter;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ sent: boolean; reason?: string }> {
  const t = getTransporter();
  const fromEmail = process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "noreply@harmonia.app";

  if (!t) {
    logger.warn({ to: opts.to, subject: opts.subject }, "Email not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — skipping send");
    return { sent: false, reason: "Email delivery not configured" };
  }

  try {
    await t.sendMail({
      from: `Harmonia <${fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
    logger.info({ to: opts.to, subject: opts.subject }, "Email sent successfully");
    return { sent: true };
  } catch (err) {
    logger.error({ to: opts.to, subject: opts.subject, err }, "Failed to send email");
    return { sent: false, reason: String(err) };
  }
}
