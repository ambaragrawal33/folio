import nodemailer from 'nodemailer';
import type { Env } from '../config/env.ts';
export interface MailMessage {
  to: string;
  purpose: 'verify' | 'reset';
  url: string;
}
export interface EmailProvider {
  send(message: MailMessage): Promise<void>;
}
export function developmentEmail(env: Env): EmailProvider {
  const smtp = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 5000,
    socketTimeout: 5000,
  });
  return {
    async send(message) {
      if (env.NODE_ENV === 'production')
        throw new Error('Select a production email provider before deployment');
      const text =
        (message.purpose === 'verify'
          ? 'Verify your Folio email address'
          : 'Reset your Folio password') +
        '\n\n' +
        message.url +
        '\n\nIf you did not request this, ignore this email.';
      if (env.EMAIL_TRANSPORT === 'console') {
        // Explicit developer transport, not application logs. Never enabled in production.
        process.stderr.write('[Development email] ' + text + '\n');
        return;
      }
      await smtp.sendMail({
        from: 'Folio <no-reply@folio.local>',
        to: message.to,
        subject:
          message.purpose === 'verify' ? 'Verify your Folio email' : 'Reset your Folio password',
        text,
      });
    },
  };
}
