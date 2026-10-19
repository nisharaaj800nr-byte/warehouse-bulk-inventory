import nodemailer from 'nodemailer';
import type { Db } from '../db/index.js';
import { ApiError } from '../lib/errors.js';

export interface MailSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
}

function readSettings(db: Db): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function mailSettings(db: Db): MailSettings | null {
  const values = readSettings(db);
  const host = values['SMTP_HOST'] ?? '';
  const from = values['SMTP_FROM'] ?? values['SMTP_USER'] ?? '';
  const to = values['ALERT_EMAIL_TO'] ?? '';

  if (!host || !from) return null;

  return {
    host,
    port: Number(values['SMTP_PORT'] ?? 587),
    user: values['SMTP_USER'] ?? '',
    pass: values['SMTP_PASS'] ?? '',
    from,
    to
  };
}

/**
 * Sends a test email with the SMTP settings stored in the settings table.
 * Throws a clear validation error when email is not configured, so the UI can
 * show an actionable message instead of a generic failure.
 */
function createTransport(settings: MailSettings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined
  });
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendMailWithAttachment(
  db: Db,
  options: { to: string; subject: string; text: string; attachment?: MailAttachment }
): Promise<void> {
  const settings = mailSettings(db);
  if (!settings) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Email is not configured. Set SMTP_HOST, SMTP_FROM and the SMTP credentials in Settings.'
    );
  }

  const to = options.to.trim();
  if (!to) throw new ApiError(400, 'VALIDATION_ERROR', 'No recipient configured.');

  await createTransport(settings).sendMail({
    from: settings.from,
    to,
    subject: options.subject,
    text: options.text,
    attachments: options.attachment
      ? [
          {
            filename: options.attachment.filename,
            content: options.attachment.content,
            contentType: options.attachment.contentType
          }
        ]
      : undefined
  });
}

export async function sendTestEmail(db: Db, overrideTo?: string): Promise<{ sentTo: string }> {
  const settings = mailSettings(db);
  if (!settings) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Email is not configured. Set SMTP_HOST, SMTP_FROM and ALERT_EMAIL_TO in Settings.'
    );
  }

  const to = (overrideTo ?? settings.to).trim();
  if (!to) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'No recipient configured (ALERT_EMAIL_TO).');
  }

  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined
  });

  await transport.sendMail({
    from: settings.from,
    to,
    subject: 'Bulk Repair — test email',
    text: `This is a test email from the Bulk Repair server.\nSent at ${new Date().toISOString()}.`
  });

  return { sentTo: to };
}
