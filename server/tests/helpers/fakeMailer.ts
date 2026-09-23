import type { Mailer, MailMessage } from '../../src/mail/mailer.js';

export interface FakeMailer extends Mailer {
  readonly sent: MailMessage[];
  /** The next send() call rejects instead of recording -- for testing the
   * rollback-on-failed-send path (specifications/operations.md > External
   * Integrations). */
  failNext(): void;
}

export function createFakeMailer(): FakeMailer {
  const sent: MailMessage[] = [];
  let shouldFailNext = false;

  return {
    sent,
    failNext(): void {
      shouldFailNext = true;
    },
    async send(message: MailMessage): Promise<void> {
      if (shouldFailNext) {
        shouldFailNext = false;
        throw new Error('Simulated mail provider failure');
      }
      sent.push(message);
    },
  };
}
