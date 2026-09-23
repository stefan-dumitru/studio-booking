import type { MailMessage } from '../mailer.js';

export function verifyEmailTemplate(
  to: string,
  link: string,
  ttlHours: number,
): MailMessage {
  return {
    to,
    subject: 'Verify your Studio Booking account',
    text:
      `Welcome to Studio Booking!\n\n` +
      `Click the link below to verify your email address:\n${link}\n\n` +
      `This link expires in ${ttlHours} hours. If you didn't create this account, ` +
      `you can ignore this email.`,
    html:
      `<p>Welcome to Studio Booking!</p>` +
      `<p><a href="${link}">Click here to verify your email address</a>.</p>` +
      `<p>This link expires in ${ttlHours} hours. If you didn't create this account, ` +
      `you can ignore this email.</p>`,
  };
}
