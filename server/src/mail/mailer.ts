import nodemailer from 'nodemailer';
import type { Config } from '../config.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Real SMTP transport when SMTP_URL is set; otherwise a dev mailer that never
 * leaves the machine. Both paths go through the same Nodemailer sendMail call
 * so dev and prod exercise the same code, per specifications/operations.md >
 * Environments & Configuration ("Local development uses a console mail
 * transport, so the whole verification flow is exercisable with no provider
 * account").
 *
 * The dev transport uses jsonTransport, then console.logs the rendered text
 * body -- this is what makes "read the verification link from the terminal"
 * (functional.md > Phase 1 end-to-end check) literally true.
 */
export function createMailer(config: Config): Mailer {
  const isDev = !config.smtpUrl;
  // SMTP timeout per operations.md > External Integrations: never an
  // unbounded wait. Set on the transport (jsonTransport ignores both; they
  // only matter for a real SMTP connection).
  const transport = isDev
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        url: config.smtpUrl,
        connectionTimeout: 10_000,
        socketTimeout: 10_000,
      });

  return {
    async send(message: MailMessage): Promise<void> {
      const info = await transport.sendMail({
        from: config.mailFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      if (isDev) {
        console.log(
          `\n--- Dev mailer: email to ${message.to} ---\n` +
            `Subject: ${message.subject}\n\n${message.text}\n` +
            '--- end email ---\n',
        );
      }
      void info;
    },
  };
}
